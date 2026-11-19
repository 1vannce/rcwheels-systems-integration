import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  stockBalances,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
  users,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import { todayInManila } from "@/modules/inventory";
import { approveRequisitionService } from "@/modules/requisition/services/requisition.approve.service";
import { markAwaitingStockService } from "@/modules/requisition/services/requisition.mark-awaiting-stock.service";
import { reserveRequisitionService } from "@/modules/requisition/services/requisition.reserve.service";
import { submitRequisitionService } from "@/modules/requisition/services/requisition.submit.service";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem } from "@/test/stock-fixtures";

import { createShortagePurchaseRequisitionService } from "./purchase-requisition.create.service";
import {
  getPurchaseRequestContextService,
  listOpenPurchaseRequisitionsService,
} from "./purchase-requisition.lists.service";

describeWithDatabase("purchase requisition service", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    await db
      .update(users)
      .set({ approverId: people.requisition_approver.userId })
      .where(eq(users.userId, people.requester.userId));
    people.requester = { ...people.requester, approverId: people.requisition_approver.userId };
  });

  afterAll(closeDatabase);

  async function approvedRequest(itemId: number, quantity = "10") {
    const { requisitionId } = await submitRequisitionService(people.requester, {
      purpose: "Test shortage",
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
      isUrgent: false,
      lines: [{ itemId, requestedQty: quantity }],
    });
    const [line] = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    await approveRequisitionService(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: quantity }],
    });

    return { requisitionId, line };
  }

  async function reserve(itemId: number, quantity: string) {
    const request = await approvedRequest(itemId, "10");
    await reserveRequisitionService(people.inventory_custodian, {
      requisitionId: request.requisitionId,
      lines: [{ requisitionLineId: request.line.requisitionLineId, quantity }],
    });

    return request;
  }

  it("creates a shortage PR for only the uncovered quantity", async () => {
    const itemId = await createItem("PR-1", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      },
    );

    const [header] = await db
      .select()
      .from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId));
    const [prLine] = await db
      .select()
      .from(purchaseRequisitionLines)
      .where(eq(purchaseRequisitionLines.purchaseRequisitionId, purchaseRequisitionId));

    expect(header).toMatchObject({
      requestedBy: people.inventory_custodian.userId,
      requestReason: "shortage",
      status: "open",
    });
    expect(prLine).toMatchObject({
      requisitionLineId: line.requisitionLineId,
      itemId,
      requestedQty: "6.000",
    });

    const alerts = await db
      .select()
      .from(notifications)
      .where(eq(notifications.requisitionId, requisitionId));
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "purchase_requisition_created",
      }),
    );

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_requisition.create",
        entityId: purchaseRequisitionId,
      }),
    );

    const queue = await listOpenPurchaseRequisitionsService();
    expect(queue).toHaveLength(1);
    expect(queue[0].purchaseRequisitionId).toBe(purchaseRequisitionId);
    expect(queue[0].lines[0].requestedQty).toBe("6.000");
  });

  it("refuses more than the uncovered quantity", async () => {
    const itemId = await createItem("PR-2", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    await expect(
      createShortagePurchaseRequisitionService(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "7" }],
      }),
    ).rejects.toThrow("still uncovered");

    expect(await db.select().from(purchaseRequisitions)).toHaveLength(0);
  });

  it("refuses a second open PR for the same requisition line", async () => {
    const itemId = await createItem("PR-3", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    await createShortagePurchaseRequisitionService(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
    });

    await expect(
      createShortagePurchaseRequisitionService(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "1" }],
      }),
    ).rejects.toThrow("already covers");

    expect(await db.select().from(purchaseRequisitions)).toHaveLength(1);
  });

  it("refuses a PR before the request is awaiting stock", async () => {
    const itemId = await createItem("PR-4", "4");
    const { requisitionId, line } = await approvedRequest(itemId, "10");

    await expect(
      createShortagePurchaseRequisitionService(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "10" }],
      }),
    ).rejects.toThrow("awaiting stock");
  });

  it("lets a fully out-of-stock request become awaiting stock, then raises a PR", async () => {
    const itemId = await createItem("PR-5", "0");
    const { requisitionId, line } = await approvedRequest(itemId, "10");

    await markAwaitingStockService(people.inventory_custodian, requisitionId);

    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "10" }],
      },
    );

    const [prLine] = await db
      .select()
      .from(purchaseRequisitionLines)
      .where(eq(purchaseRequisitionLines.purchaseRequisitionId, purchaseRequisitionId));

    expect(prLine.requestedQty).toBe("10.000");
  });

  it("asks the custodian to reserve stock that arrived before raising a PR", async () => {
    const itemId = await createItem("PR-6", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    await db
      .update(stockBalances)
      .set({ quantityOnHand: "9" })
      .where(
        and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, "usable")),
      );

    await expect(
      createShortagePurchaseRequisitionService(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      }),
    ).rejects.toThrow("Reserve it before raising");
  });

  it("subtracts committed and received PO quantity from the uncovered need", async () => {
    const itemId = await createItem("PR-7", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    const first = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      },
    );
    const [firstLine] = await db
      .select()
      .from(purchaseRequisitionLines)
      .where(
        eq(
          purchaseRequisitionLines.purchaseRequisitionId,
          first.purchaseRequisitionId,
        ),
      );

    // The first PR has been converted into a committed PO, so it no longer
    // blocks a new PR. Of its 2 ordered units, 1 has been accepted, leaving 1
    // outstanding and reducing the next uncovered need to 5.
    await db
      .update(purchaseRequisitions)
      .set({ status: "covered" })
      .where(
        eq(
          purchaseRequisitions.purchaseRequisitionId,
          first.purchaseRequisitionId,
        ),
      );

    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Test supplier" })
      .returning();
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        supplierId: supplier.supplierId,
        preparedBy: people.purchasing_staff.userId,
        status: "approved",
      })
      .returning();
    const [orderLine] = await db
      .insert(purchaseOrderLines)
      .values({
        purchaseOrderId: order.purchaseOrderId,
        purchaseRequisitionLineId: firstLine.purchaseRequisitionLineId,
        orderedQty: "2",
        unitPrice: "100",
      })
      .returning();
    const [receipt] = await db
      .insert(supplierReceipts)
      .values({
        purchaseOrderId: order.purchaseOrderId,
        receivedBy: people.inventory_custodian.userId,
        deliveryReceiptNo: "DR-TEST",
      })
      .returning();
    await db.insert(supplierReceiptLines).values({
      supplierReceiptId: receipt.supplierReceiptId,
      purchaseOrderLineId: orderLine.purchaseOrderLineId,
      deliveredQty: "1",
      acceptedQty: "1",
    });

    await expect(
      createShortagePurchaseRequisitionService(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      }),
    ).rejects.toThrow("still uncovered");

    const second = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "5" }],
      },
    );
    expect(second.purchaseRequisitionId).toBeGreaterThan(first.purchaseRequisitionId);
  });

  it("shows the custodian the uncovered need and hides the form after a PR exists", async () => {
    const itemId = await createItem("PR-8", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    const before = await getPurchaseRequestContextService(
      people.inventory_custodian,
      requisitionId,
    );
    expect(before.canCreate).toBe(true);
    expect(before.lines[0]).toMatchObject({
      needQty: "6.000",
      allocatedPoQty: "0.000",
      uncoveredQty: "6.000",
    });

    const managerView = await getPurchaseRequestContextService(
      people.inventory_manager,
      requisitionId,
    );
    expect(managerView.canCreate).toBe(false);

    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      },
    );

    const after = await getPurchaseRequestContextService(
      people.inventory_custodian,
      requisitionId,
    );
    expect(after.canCreate).toBe(false);
    expect(after.openPurchaseRequisition?.purchaseRequisitionId).toBe(
      purchaseRequisitionId,
    );
  });

  it("blocks another role and audits the refusal", async () => {
    const itemId = await createItem("PR-9", "4");
    const { requisitionId, line } = await reserve(itemId, "4");

    await expect(
      createShortagePurchaseRequisitionService(people.requester, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, requestedQty: "6" }],
      }),
    ).rejects.toThrow("Only the Inventory Custodian");

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "blocked:purchase_requisition.create" }),
    );
  });
});
