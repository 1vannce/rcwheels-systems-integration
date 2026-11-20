import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockMovements,
  supplierReceiptLines,
  supplierReceipts,
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
import { cancelPurchaseOrderBalanceService } from "./purchase-order.cancel.service";
import {
  getPurchaseOrderFormContextService,
  listPurchaseOrdersForReceivingService,
} from "./purchase-order.lists.service";
import { placePurchaseOrderService } from "./purchase-order.place.service";

type SetupStatus =
  | "pending_approval"
  | "for_revision"
  | "approved"
  | "placed"
  | "partially_received"
  | "closed"
  | "cancelled";

describeWithDatabase("purchase order cancellation service", () => {
  let people: Record<AppRole, AppUser>;
  let sequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    sequence = 0;
  });

  afterAll(closeDatabase);

  async function setupPo(
    options: {
      status?: SetupStatus;
      requestedQty?: string;
      orderedQty?: string;
      acceptedQty?: string;
      prStatus?: "open" | "covered";
    } = {},
  ) {
    sequence += 1;
    const requestedQty = options.requestedQty ?? options.orderedQty ?? "6";
    const orderedQty = options.orderedQty ?? "6";
    const acceptedQty = options.acceptedQty ?? "0";
    const itemCode = `PO-CANCEL-${sequence}`;
    const itemId = await createItem(itemCode, "0");
    const request = await createRequisitionLine(
      people.requester.userId,
      itemId,
      requestedQty,
    );
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: `Cancel Supplier ${sequence}` })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: options.prStatus ?? "open",
      })
      .returning();
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty,
      })
      .returning();
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    const [poLine] = await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty,
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
            itemCode,
            itemName: `Test ${itemCode}`,
            unit: "pc",
            orderedQty,
            unitPrice: "1500",
          },
        ],
      }),
    });
    await db
      .update(purchaseOrders)
      .set({
        status: options.status ?? "approved",
        approvedBy: people.accounting_associate.userId,
        approvedAt: new Date(),
      })
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    if (acceptedQty !== "0") {
      const [receipt] = await db
        .insert(supplierReceipts)
        .values({
          purchaseOrderId,
          receivedBy: people.inventory_custodian.userId,
          deliveryReceiptNo: `DR-CANCEL-${sequence}`,
        })
        .returning();

      await db.insert(supplierReceiptLines).values({
        supplierReceiptId: receipt.supplierReceiptId,
        purchaseOrderLineId: poLine.purchaseOrderLineId,
        deliveredQty: acceptedQty,
        acceptedQty,
        rejectedQty: "0",
      });
    }

    return {
      purchaseOrderId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseOrderLineId: poLine.purchaseOrderLineId,
    };
  }

  async function header(purchaseOrderId: number) {
    const [row] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    return row;
  }

  async function prStatus(purchaseRequisitionId: number) {
    const [row] = await db
      .select({ status: purchaseRequisitions.status })
      .from(purchaseRequisitions)
      .where(
        eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId),
      );

    return row.status;
  }

  it("cancels the remaining balance and reopens the source PR", async () => {
    const source = await setupPo({ prStatus: "covered" });

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier cannot deliver.",
    });

    expect(await header(source.purchaseOrderId)).toMatchObject({
      status: "cancelled",
      cancelledBy: people.accounting_associate.userId,
      cancellationReason: "Supplier cannot deliver.",
    });
    expect((await header(source.purchaseOrderId)).cancelledAt).not.toBeNull();

    const [line] = await db
      .select()
      .from(purchaseOrderLines)
      .where(
        eq(purchaseOrderLines.purchaseOrderLineId, source.purchaseOrderLineId),
      );
    expect(line.cancelledQty).toBe("6.000");
    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_order.cancel_balance",
        entityId: source.purchaseOrderId,
      }),
    );

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "purchase_order_balance_cancelled",
        message: expect.stringContaining(`#${source.purchaseRequisitionId}`),
      }),
    );

    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it("closes a partially received PO and keeps accepted quantity in coverage", async () => {
    const source = await setupPo({
      status: "partially_received",
      requestedQty: "6",
      orderedQty: "6",
      acceptedQty: "2",
      prStatus: "covered",
    });

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier will not deliver the rest.",
    });

    expect((await header(source.purchaseOrderId)).status).toBe("closed");

    const [line] = await db
      .select()
      .from(purchaseOrderLines)
      .where(
        eq(purchaseOrderLines.purchaseOrderLineId, source.purchaseOrderLineId),
      );
    expect(line.cancelledQty).toBe("4.000");

    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");
  });

  it("counts accepted quantity when reopening the PR for a replacement PO", async () => {
    const source = await setupPo({
      status: "partially_received",
      requestedQty: "6",
      orderedQty: "6",
      acceptedQty: "2",
      prStatus: "covered",
    });

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier will not deliver the rest.",
    });

    const context = await getPurchaseOrderFormContextService(
      people.purchasing_staff,
      source.purchaseRequisitionId,
    );

    expect(context).not.toBeNull();
    expect(context?.lines[0]).toMatchObject({
      requestedQty: "6.000",
      allocatedQty: "2.000",
      remainingQty: "4.000",
    });
  });

  it("keeps a covered PR covered when accepted quantity meets the request", async () => {
    const source = await setupPo({
      status: "partially_received",
      requestedQty: "2",
      orderedQty: "4",
      acceptedQty: "2",
      prStatus: "covered",
    });

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Cancel the excess quantity.",
    });

    expect((await header(source.purchaseOrderId)).status).toBe("closed");
    expect(await prStatus(source.purchaseRequisitionId)).toBe("covered");
  });

  it("blocks a second cancellation", async () => {
    const source = await setupPo();
    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier cannot deliver.",
    });

    await expect(
      cancelPurchaseOrderBalanceService(people.accounting_associate, {
        purchaseOrderId: source.purchaseOrderId,
        reason: "Try again.",
      }),
    ).rejects.toThrow("already cancelled");
  });

  it("blocks cancellation when nothing remains", async () => {
    const source = await setupPo({
      status: "partially_received",
      requestedQty: "2",
      orderedQty: "2",
      acceptedQty: "2",
    });

    await expect(
      cancelPurchaseOrderBalanceService(people.accounting_associate, {
        purchaseOrderId: source.purchaseOrderId,
        reason: "Nothing to cancel.",
      }),
    ).rejects.toThrow("no remaining balance");
  });

  it.each(["pending_approval", "for_revision"] as const)(
    "points a %s draft to discard instead",
    async (status) => {
      const source = await setupPo({ status });

      await expect(
        cancelPurchaseOrderBalanceService(people.accounting_associate, {
          purchaseOrderId: source.purchaseOrderId,
          reason: "Not allowed.",
        }),
      ).rejects.toThrow("Discard an unapproved draft");
    },
  );

  it.each(["closed", "cancelled"] as const)(
    "blocks a %s purchase order",
    async (status) => {
      const source = await setupPo({ status });

      await expect(
        cancelPurchaseOrderBalanceService(people.accounting_associate, {
          purchaseOrderId: source.purchaseOrderId,
          reason: "Not allowed.",
        }),
      ).rejects.toThrow("already closed or cancelled");
    },
  );

  it("blocks a non-accounting role", async () => {
    const source = await setupPo();

    await expect(
      cancelPurchaseOrderBalanceService(people.purchasing_staff, {
        purchaseOrderId: source.purchaseOrderId,
        reason: "Not allowed.",
      }),
    ).rejects.toThrow("Only the Accounting Associate");
  });

  it("refuses a cancellation reason that is too short", async () => {
    const source = await setupPo();

    await expect(
      cancelPurchaseOrderBalanceService(people.accounting_associate, {
        purchaseOrderId: source.purchaseOrderId,
        reason: "no",
      }),
    ).rejects.toThrow("Give a reason for cancelling");
  });

  it("prevents placement of a cancelled PO", async () => {
    const source = await setupPo();
    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier cannot deliver.",
    });

    await expect(
      placePurchaseOrderService(people.purchasing_staff, {
        purchaseOrderId: source.purchaseOrderId,
      }),
    ).rejects.toThrow("Only an approved purchase order can be placed");
  });

  it("removes a cancelled PO from the receiving handoff", async () => {
    const source = await setupPo({ status: "placed" });

    const before = await listPurchaseOrdersForReceivingService(
      people.delivery_operations,
    );
    expect(before.map((order) => order.purchaseOrderId)).toContain(
      source.purchaseOrderId,
    );

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Supplier cannot deliver.",
    });

    const after = await listPurchaseOrdersForReceivingService(
      people.delivery_operations,
    );
    expect(after.map((order) => order.purchaseOrderId)).not.toContain(
      source.purchaseOrderId,
    );
  });
});
