import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockMovements,
  suppliers,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, createRequisitionLine } from "@/test/stock-fixtures";

import {
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  insertPurchaseOrderRevision,
} from "../repositories/purchase-order.repository";
import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";
import { listPurchaseOrdersForReceivingService } from "./purchase-order.lists.service";
import { placePurchaseOrderService } from "./purchase-order.place.service";
import { approvePurchaseOrderService } from "./purchase-order.review.service";
import { updatePurchaseOrderService } from "./purchase-order.update.service";

describeWithDatabase("purchase order place service", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function setupApprovedPo(options: { approved?: boolean } = {}) {
    const itemId = await createItem("PO-PLACE-1", "0");
    const request = await createRequisitionLine(people.requester.userId, itemId, "10");
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "open",
      })
      .returning();
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty: "10",
      })
      .returning();
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: "6",
        unitPrice: "1500",
      },
    ]);
    await insertPurchaseOrderRevision(db, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
            itemId,
            itemCode: "PO-PLACE-1",
            itemName: "Test PO-PLACE-1",
            unit: "pc",
            orderedQty: "6",
            unitPrice: "1500",
          },
        ],
      }),
    });
    if (options.approved !== false) {
      await approvePurchaseOrderService(people.accounting_associate, {
        purchaseOrderId,
        reason: "Budget approved.",
      });
    }

    return {
      purchaseOrderId,
      supplierId: supplier.supplierId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
    };
  }

  it("places an approved PO, records the date, and hands it to receiving", async () => {
    const source = await setupApprovedPo();

    const result = await placePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId: source.purchaseOrderId,
    });

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, source.purchaseOrderId));

    expect(result).toEqual({
      purchaseOrderId: source.purchaseOrderId,
      status: "placed",
    });
    expect(header).toMatchObject({ status: "placed" });
    expect(header.orderedAt).not.toBeNull();
    expect(await db.select().from(stockMovements)).toHaveLength(0);

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_order.place",
        entityId: source.purchaseOrderId,
      }),
    );

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.delivery_operations.userId,
        notificationType: "purchase_order_placed",
      }),
    );
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.inventory_custodian.userId,
        notificationType: "purchase_order_ready_to_receive",
        message: expect.stringContaining(`Purchase order #${source.purchaseOrderId} `),
      }),
    );

    const receiving = await listPurchaseOrdersForReceivingService(
      people.delivery_operations,
    );
    expect(receiving.map((order) => order.purchaseOrderId)).toEqual([
      source.purchaseOrderId,
    ]);
    await expect(
      listPurchaseOrdersForReceivingService(people.inventory_custodian),
    ).resolves.toHaveLength(1);
    await expect(
      listPurchaseOrdersForReceivingService(people.purchasing_staff),
    ).resolves.toEqual([]);
  });

  it("refuses to place a PO that is not approved", async () => {
    const source = await setupApprovedPo({ approved: false });

    await expect(
      placePurchaseOrderService(people.purchasing_staff, {
        purchaseOrderId: source.purchaseOrderId,
      }),
    ).rejects.toThrow("Only an approved purchase order");
  });

  it("refuses to place a changed PO until its new version is approved", async () => {
    const source = await setupApprovedPo();
    await updatePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId: source.purchaseOrderId,
      supplierId: source.supplierId,
      deliveryTerms: null,
      lines: [
        {
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          orderedQty: "7",
          unitPrice: "1600",
        },
      ],
    });

    await expect(
      placePurchaseOrderService(people.purchasing_staff, {
        purchaseOrderId: source.purchaseOrderId,
      }),
    ).rejects.toThrow("Only an approved purchase order");

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, source.purchaseOrderId));
    expect(header.status).toBe("pending_approval");
    expect(header.orderedAt).toBeNull();
  });

  it("refuses a second placement", async () => {
    const source = await setupApprovedPo();
    await placePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId: source.purchaseOrderId,
    });

    await expect(
      placePurchaseOrderService(people.purchasing_staff, {
        purchaseOrderId: source.purchaseOrderId,
      }),
    ).rejects.toThrow("Only an approved purchase order");
  });

  it("blocks another role from placing", async () => {
    const source = await setupApprovedPo();

    await expect(
      placePurchaseOrderService(people.requester, {
        purchaseOrderId: source.purchaseOrderId,
      }),
    ).rejects.toThrow("Only Purchasing Staff");

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "blocked:purchase_order.place" }),
    );
  });
});
