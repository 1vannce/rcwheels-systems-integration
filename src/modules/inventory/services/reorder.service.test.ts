import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  items,
  notifications,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockAdjustments,
  stockBalances,
  suppliers,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import {
  createItem,
  createRequisitionLine,
  createSupplierReceiptLine,
} from "@/test/stock-fixtures";

import { updateReorderPoint } from "./item.service";
import { REORDER_ALERT_TYPE } from "./reorder.service";
import { recordSalesDeduction, reverseSalesDeduction } from "./sales-deduction.service";
import {
  acceptSupplierReceipt,
  applyApprovedAdjustment,
  releaseReservation,
  reserveStock,
  returnToSupplier,
} from "./stock.service";

// Scenario 9: stock falls to the reorder point. The Custodian and Inventory
// Manager are alerted once, with the open PR and PO coverage, and no PR is made.
describeWithDatabase("reorder alert", () => {
  let users: Record<AppRole, AppUser>;
  let saleNo = 0;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
    saleNo = 0;
  });

  afterAll(closeDatabase);

  async function itemWithReorderPoint(onHandQty: string, reorderPoint: string) {
    const itemId = await createItem("TIRE-RP", onHandQty);

    await db.update(items).set({ reorderPoint }).where(eq(items.itemId, itemId));

    return itemId;
  }

  async function sell(itemId: number, quantity: string) {
    saleNo += 1;

    return recordSalesDeduction(users.inventory_custodian, {
      itemId,
      quantity,
      salesRef: `SR-${saleNo}`,
      saleDate: "2026-11-27",
    }, new Date("2026-11-27T04:00:00Z"));
  }

  async function reorderAlerts() {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.notificationType, REORDER_ALERT_TYPE))
      .orderBy(notifications.notificationId);
  }

  async function purchaseRequisitionCount() {
    return (await db.select().from(purchaseRequisitions)).length;
  }

  /** A placed PO for the item with `orderedQty` outstanding. */
  async function openPurchaseOrder(itemId: number, orderedQty: string) {
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Test Supplier" })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({ requestedBy: users.inventory_custodian.userId, requestReason: "reorder", status: "covered" })
      .returning();
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({ purchaseRequisitionId: pr.purchaseRequisitionId, itemId, requestedQty: orderedQty })
      .returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        supplierId: supplier.supplierId,
        preparedBy: users.purchasing_staff.userId,
        status: "placed",
      })
      .returning();

    await db.insert(purchaseOrderLines).values({
      purchaseOrderId: po.purchaseOrderId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
      orderedQty,
      unitPrice: "1500",
    });

    return po.purchaseOrderId;
  }

  it("alerts the Custodian and Inventory Manager once when available crosses the reorder point", async () => {
    const itemId = await itemWithReorderPoint("10", "8");

    await sell(itemId, "1");
    expect(await reorderAlerts()).toHaveLength(0);

    await sell(itemId, "1");

    const alerts = await reorderAlerts();

    expect(alerts.map((alert) => alert.recipientUserId).sort()).toEqual(
      [users.inventory_custodian.userId, users.inventory_manager.userId].sort(),
    );
    expect(alerts[0].message).toContain("TIRE-RP");
    expect(alerts[0].message).toContain("8 pc available");
    expect(alerts[0].message).toContain("No open purchase requisition or purchase order");

    const audit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "inventory.reorder-alert"));

    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityType: "items", entityId: itemId, actorUserId: null });
    expect(await purchaseRequisitionCount()).toBe(0);
  });

  it("does not alert again on a second deduction while the alert is unresolved", async () => {
    const itemId = await itemWithReorderPoint("10", "8");

    await sell(itemId, "3");
    await sell(itemId, "2");
    await sell(itemId, "5");

    expect(await reorderAlerts()).toHaveLength(2); // one alert, two recipients
    expect(await purchaseRequisitionCount()).toBe(0);
  });

  it("shows open PO and PR coverage and raises no new purchase requisition", async () => {
    const itemId = await itemWithReorderPoint("10", "8");
    const purchaseOrderId = await openPurchaseOrder(itemId, "12");
    const [openPr] = await db
      .insert(purchaseRequisitions)
      .values({ requestedBy: users.inventory_custodian.userId, requestReason: "reorder" })
      .returning();

    await db.insert(purchaseRequisitionLines).values({
      purchaseRequisitionId: openPr.purchaseRequisitionId,
      itemId,
      requestedQty: "4",
    });

    const prsBefore = await purchaseRequisitionCount();

    await sell(itemId, "3");

    const alerts = await reorderAlerts();

    expect(alerts).toHaveLength(2);
    expect(alerts[0].message).toContain(
      `PO-${String(purchaseOrderId).padStart(4, "0")} 12 pc outstanding`,
    );
    expect(alerts[0].message).toContain(`PR #${openPr.purchaseRequisitionId} 4 pc not yet ordered`);
    expect(await purchaseRequisitionCount()).toBe(prsBefore);
  });

  it("does not alert on stock increases", async () => {
    const itemId = await itemWithReorderPoint("3", "8");
    const receiptLineId = await createSupplierReceiptLine(
      users.inventory_custodian.userId,
      itemId,
      "2",
      "1000",
    );

    // A receipt (3 -> 5) and a sales reversal both raise stock.
    await db.transaction((tx) => acceptSupplierReceipt(tx, { supplierReceiptLineId: receiptLineId }));
    expect(await reorderAlerts()).toHaveLength(0);

    const sale = await sell(itemId, "1"); // lowering: the first, never-alerted check fires
    expect(await reorderAlerts()).toHaveLength(2);

    await reverseSalesDeduction(users.inventory_custodian, {
      movementId: sale.movementId,
      reason: "Wrong item",
    });
    expect(await reorderAlerts()).toHaveLength(2);
  });

  it("alerts when a reservation lowers available, and again after stock recovers and falls back", async () => {
    const itemId = await itemWithReorderPoint("10", "8");
    const line = await createRequisitionLine(users.requester.userId, itemId, "3");

    const { reservationId } = await db.transaction((tx) =>
      reserveStock(tx, { requisitionLineId: line.requisitionLineId, quantity: "3", sourceRef: "r1" }),
    );

    expect(await reorderAlerts()).toHaveLength(2);

    await db.transaction((tx) => releaseReservation(tx, { reservationId }));
    await db.transaction((tx) =>
      reserveStock(tx, { requisitionLineId: line.requisitionLineId, quantity: "3", sourceRef: "r2" }),
    );

    expect(await reorderAlerts()).toHaveLength(4);
  });

  it("alerts on an approved adjustment down, and when the reorder point is raised past available", async () => {
    const itemId = await itemWithReorderPoint("10", "8");
    const [usable] = await db
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, "usable")));
    const [adjustment] = await db
      .insert(stockAdjustments)
      .values({
        stockBalanceId: usable.stockBalanceId,
        countedBy: users.inventory_custodian.userId,
        approvedBy: users.inventory_manager.userId,
        recordedQty: "10",
        countedQty: "7",
        reason: "Count",
        status: "approved",
      })
      .returning();

    await db.transaction((tx) =>
      applyApprovedAdjustment(tx, { adjustmentId: adjustment.adjustmentId }),
    );
    expect(await reorderAlerts()).toHaveLength(2);

    const other = await createItem("RIM-RP", "6");

    await updateReorderPoint(users.inventory_manager, { itemId: other, reorderPoint: "4" });
    expect(await reorderAlerts()).toHaveLength(2);

    await updateReorderPoint(users.inventory_manager, { itemId: other, reorderPoint: "6" });
    expect(await reorderAlerts()).toHaveLength(4);
  });

  it("alerts when a return to supplier crosses the reorder point", async () => {
    const itemId = await itemWithReorderPoint("7", "8");
    const receiptLineId = await createSupplierReceiptLine(
      users.inventory_custodian.userId,
      itemId,
      "3",
      "1000",
    );

    await db.transaction((tx) => acceptSupplierReceipt(tx, { supplierReceiptLineId: receiptLineId }));
    expect(await reorderAlerts()).toHaveLength(0);

    await db.transaction((tx) =>
      returnToSupplier(tx, { supplierReceiptLineId: receiptLineId, quantity: "2", sourceRef: "rts-1" }),
    );

    expect(await reorderAlerts()).toHaveLength(2);
  });

  it("alerts when a first reorder point is set on an out-of-stock item", async () => {
    const itemId = await createItem("RIM-OUT", "0");

    await updateReorderPoint(users.inventory_manager, { itemId, reorderPoint: "4" });

    expect(await reorderAlerts()).toHaveLength(2);
  });

  it("alerts once for stock already below its point that was never alerted", async () => {
    const itemId = await itemWithReorderPoint("5", "8");

    await sell(itemId, "1");
    await sell(itemId, "1");

    expect(await reorderAlerts()).toHaveLength(2);
  });

  it("does not alert for an item with no reorder point", async () => {
    const itemId = await createItem("LUG-0", "2");

    await sell(itemId, "2");

    expect(await reorderAlerts()).toHaveLength(0);
  });
});
