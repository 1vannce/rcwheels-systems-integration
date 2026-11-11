import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  dispatchLines,
  dispatches,
  internalDiscrepancies,
  items,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  requisitions,
  returnLines,
  returns,
  stockBalances,
  stockMovements,
  stockReservations,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
} from "@/db/schema";

// Rows that later phases will create through their own services. Tests insert
// them directly so the stock events have source documents to post against.

export async function createItem(itemCode: string, usableOnHand = "0"): Promise<number> {
  const [item] = await db
    .insert(items)
    .values({ itemCode, itemName: `Test ${itemCode}`, specification: "Test", unit: "pc" })
    .returning();

  await db.insert(stockBalances).values([
    { itemId: item.itemId, condition: "usable", quantityOnHand: usableOnHand },
    { itemId: item.itemId, condition: "damaged" },
    { itemId: item.itemId, condition: "hold" },
  ]);

  return item.itemId;
}

export async function createRequisitionLine(
  userId: number,
  itemId: number,
  requestedQty: string,
): Promise<{ requisitionId: number; requisitionLineId: number }> {
  const [requisition] = await db
    .insert(requisitions)
    .values({
      submittedBy: userId,
      requesterName: "Test Requester",
      purpose: "Test",
      deliveryDate: "2026-11-11",
      deliveryLocation: "Test workshop",
    })
    .returning();
  const [line] = await db
    .insert(requisitionLines)
    .values({ requisitionId: requisition.requisitionId, itemId, requestedQty })
    .returning();

  return {
    requisitionId: requisition.requisitionId,
    requisitionLineId: line.requisitionLineId,
  };
}

export async function createDispatchLine(
  userId: number,
  line: { requisitionId: number; requisitionLineId: number },
  sentQty: string,
): Promise<number> {
  const [dispatch] = await db
    .insert(dispatches)
    .values({
      requisitionId: line.requisitionId,
      dispatchedBy: userId,
      deliveryPersonnel: "Test Driver",
    })
    .returning();
  const [dispatchLine] = await db
    .insert(dispatchLines)
    .values({
      dispatchId: dispatch.dispatchId,
      requisitionLineId: line.requisitionLineId,
      sentQty,
    })
    .returning();

  return dispatchLine.dispatchLineId;
}

export async function createReturnLine(
  userId: number,
  dispatchLineId: number,
  returnedQty: string,
): Promise<number> {
  const [discrepancy] = await db
    .insert(internalDiscrepancies)
    .values({ dispatchLineId, reportedBy: userId, affectedQty: returnedQty, problem: "Test" })
    .returning();
  const [returned] = await db
    .insert(returns)
    .values({
      internalDiscrepancyId: discrepancy.internalDiscrepancyId,
      receivedBy: userId,
    })
    .returning();
  const [line] = await db
    .insert(returnLines)
    .values({ returnId: returned.returnId, dispatchLineId, returnedQty, condition: "hold" })
    .returning();

  return line.returnLineId;
}

export async function createSupplierReceiptLine(
  userId: number,
  itemId: number,
  acceptedQty: string,
  unitPrice: string,
): Promise<number> {
  const [supplier] = await db
    .insert(suppliers)
    .values({ supplierName: "Test Supplier" })
    .returning();
  const [purchaseRequisition] = await db
    .insert(purchaseRequisitions)
    .values({ requestedBy: userId, requestReason: "reorder" })
    .returning();
  const [purchaseRequisitionLine] = await db
    .insert(purchaseRequisitionLines)
    .values({
      purchaseRequisitionId: purchaseRequisition.purchaseRequisitionId,
      itemId,
      requestedQty: acceptedQty,
    })
    .returning();
  const [order] = await db
    .insert(purchaseOrders)
    .values({ supplierId: supplier.supplierId, preparedBy: userId })
    .returning();
  const [orderLine] = await db
    .insert(purchaseOrderLines)
    .values({
      purchaseOrderId: order.purchaseOrderId,
      purchaseRequisitionLineId: purchaseRequisitionLine.purchaseRequisitionLineId,
      orderedQty: acceptedQty,
      unitPrice,
    })
    .returning();
  const [receipt] = await db
    .insert(supplierReceipts)
    .values({
      purchaseOrderId: order.purchaseOrderId,
      receivedBy: userId,
      deliveryReceiptNo: "DR-TEST",
    })
    .returning();
  const [receiptLine] = await db
    .insert(supplierReceiptLines)
    .values({
      supplierReceiptId: receipt.supplierReceiptId,
      purchaseOrderLineId: orderLine.purchaseOrderLineId,
      deliveredQty: acceptedQty,
      acceptedQty,
    })
    .returning();

  return receiptLine.supplierReceiptLineId;
}

export async function onHand(
  itemId: number,
  condition: "usable" | "damaged" | "hold" = "usable",
): Promise<string> {
  const [balance] = await db
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, condition)));

  return balance.quantityOnHand;
}

export async function isIncomplete(itemId: number): Promise<boolean> {
  const [balance] = await db
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, "usable")));

  return balance.isIncomplete;
}

export async function averageCost(itemId: number): Promise<string> {
  const [item] = await db.select().from(items).where(eq(items.itemId, itemId));

  return item.averageCost;
}

export async function movements() {
  return db.select().from(stockMovements).orderBy(stockMovements.movementId);
}

export async function reservations() {
  return db.select().from(stockReservations).orderBy(stockReservations.reservationId);
}
