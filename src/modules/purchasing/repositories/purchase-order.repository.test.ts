import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
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

import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";
import {
  findOpenPurchaseRequisitionLinesForOrder,
  findPurchaseOrderById,
  findPurchaseOrders,
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  insertPurchaseOrderRevision,
  lockPurchaseRequisitionLines,
} from "./purchase-order.repository";

describeWithDatabase("purchase order repository", () => {
  let people: Record<AppRole, AppUser>;
  let itemSequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    itemSequence = 0;
  });

  afterAll(closeDatabase);

  async function setupOpenPr(quantity = "10") {
    itemSequence += 1;
    const itemCode = `PO-${itemSequence}`;
    const itemId = await createItem(itemCode, "0");
    const request = await createRequisitionLine(people.requester.userId, itemId, quantity);
    const [supplier] = await db
      .insert(suppliers)
      .values({
        supplierName: "Sugbo Tire Trading",
        contactPerson: "Elena Ramos",
        contactDetails: "elena@sugbotire.test",
        address: "Mandaue City, Cebu",
      })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "open",
      })
      .returning();
    const [line] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty: quantity,
      })
      .returning();

    return {
      itemId,
      itemCode,
      supplier,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
      requisitionLineId: request.requisitionLineId,
    };
  }

  it("reports requested, active allocation, and remaining PR quantity", async () => {
    const source = await setupOpenPr("10");

    const initial = await findOpenPurchaseRequisitionLinesForOrder(
      db,
      source.purchaseRequisitionId,
    );
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      purchaseRequisitionLineId: source.purchaseRequisitionLineId,
      requestedQty: "10.000",
      allocatedQty: "0.000",
      remainingQty: "10.000",
    });

    const draftId = await insertPurchaseOrder(db, {
      supplierId: source.supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, draftId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "4",
        unitPrice: "1500",
      },
    ]);

    const allocated = await findOpenPurchaseRequisitionLinesForOrder(
      db,
      source.purchaseRequisitionId,
    );
    expect(allocated[0]).toMatchObject({
      allocatedQty: "4.000",
      remainingQty: "6.000",
    });

    const cancelledId = await insertPurchaseOrder(db, {
      supplierId: source.supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, cancelledId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "2",
        unitPrice: "1400",
      },
    ]);
    await db
      .update(purchaseOrders)
      .set({ status: "cancelled" })
      .where(eq(purchaseOrders.purchaseOrderId, cancelledId));

    const afterCancelled = await findOpenPurchaseRequisitionLinesForOrder(
      db,
      source.purchaseRequisitionId,
    );
    expect(afterCancelled[0]).toMatchObject({
      allocatedQty: "4.000",
      remainingQty: "6.000",
    });
  });

  it("locks PR lines in ascending ID order", async () => {
    const first = await setupOpenPr("5");
    const second = await setupOpenPr("5");

    const locked = await db.transaction((tx) =>
      lockPurchaseRequisitionLines(tx, [
        second.purchaseRequisitionLineId,
        first.purchaseRequisitionLineId,
      ]),
    );

    expect(locked.map((row) => row.purchaseRequisitionLineId)).toEqual(
      [first.purchaseRequisitionLineId, second.purchaseRequisitionLineId].sort(
        (a, b) => a - b,
      ),
    );
  });

  it("stores a PO draft, version 1 snapshot, and reads it back", async () => {
    const source = await setupOpenPr("10");

    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: source.supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: "Deliver to Bay 2",
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "6",
        unitPrice: "1500",
      },
    ]);
    const snapshot = serializePurchaseOrderSnapshot({
      supplier: source.supplier,
      deliveryTerms: "Deliver to Bay 2",
      lines: [
        {
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          itemId: source.itemId,
          itemCode: source.itemCode,
          itemName: `Test ${source.itemCode}`,
          unit: "pc",
          orderedQty: "6",
          unitPrice: "1500",
        },
      ],
    });
    const revisionId = await insertPurchaseOrderRevision(db, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      snapshot,
    });

    const detail = await findPurchaseOrderById(db, purchaseOrderId);

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      purchaseOrderId,
      supplierId: source.supplier.supplierId,
      supplierName: "Sugbo Tire Trading",
      preparedBy: people.purchasing_staff.userId,
      status: "pending_approval",
      currentVersion: 1,
      deliveryTerms: "Deliver to Bay 2",
    });
    expect(detail?.lines).toHaveLength(1);
    expect(detail?.lines[0]).toMatchObject({
      purchaseRequisitionLineId: source.purchaseRequisitionLineId,
      itemCode: source.itemCode,
      orderedQty: "6.000",
      unitPrice: "1500.00",
    });
    expect(detail?.revisions).toHaveLength(1);
    expect(detail?.revisions[0]).toMatchObject({
      revisionId,
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      budgetOk: null,
    });
    expect(detail?.revisions[0].snapshot).toBe(snapshot);

    const pending = await findPurchaseOrders(db, {
      statuses: ["pending_approval"],
      limit: 10,
    });
    expect(pending.map((po) => po.purchaseOrderId)).toContain(purchaseOrderId);

    const cancelled = await findPurchaseOrders(db, {
      statuses: ["cancelled"],
      limit: 10,
    });
    expect(cancelled).toHaveLength(0);
  });

  it("reads accepted and outstanding quantities from supplier receipts", async () => {
    const source = await setupOpenPr("10");
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: source.supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    const [line] = await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "6",
        unitPrice: "1500",
      },
    ]);
    const [receipt] = await db
      .insert(supplierReceipts)
      .values({
        purchaseOrderId,
        receivedBy: people.inventory_custodian.userId,
        deliveryReceiptNo: "DR-1001",
      })
      .returning();

    await db.insert(supplierReceiptLines).values({
      supplierReceiptId: receipt.supplierReceiptId,
      purchaseOrderLineId: line.purchaseOrderLineId,
      deliveredQty: "2",
      acceptedQty: "2",
      rejectedQty: "0",
    });

    const detail = await findPurchaseOrderById(db, purchaseOrderId);
    expect(detail?.lines[0]).toMatchObject({
      acceptedQty: "2.000",
      outstandingQty: "4.000",
    });

    const [listed] = await findPurchaseOrders(db, { limit: 10 });
    expect(listed.lines[0]).toMatchObject({
      acceptedQty: "2.000",
      outstandingQty: "4.000",
    });
  });

  it("reads the cancellation fields and who cancelled", async () => {
    const source = await setupOpenPr("10");
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: source.supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "2",
        unitPrice: "1500",
      },
    ]);

    const cancelledAt = new Date("2026-11-19T10:00:00.000Z");
    await db
      .update(purchaseOrders)
      .set({
        status: "cancelled",
        cancelledBy: people.accounting_associate.userId,
        cancelledAt,
        cancellationReason: "Supplier cannot deliver the balance.",
      })
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    const detail = await findPurchaseOrderById(db, purchaseOrderId);
    expect(detail).toMatchObject({
      status: "cancelled",
      cancelledBy: people.accounting_associate.userId,
      cancelledByName: people.accounting_associate.fullName,
      cancelledAt,
      cancellationReason: "Supplier cannot deliver the balance.",
    });

    const [listed] = await findPurchaseOrders(db, {
      statuses: ["cancelled"],
      limit: 10,
    });
    expect(listed).toMatchObject({
      status: "cancelled",
      cancelledBy: people.accounting_associate.userId,
      cancelledByName: people.accounting_associate.fullName,
      cancelledAt,
      cancellationReason: "Supplier cannot deliver the balance.",
    });
  });
});
