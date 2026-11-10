import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  dispatchLines,
  items,
  purchaseOrderLines,
  purchaseRequisitionLines,
  requisitionLines,
  returnLines,
  stockAdjustments,
  stockBalances,
  stockMovements,
  stockReservations,
  supplierReceiptLines,
} from "@/db/schema";

import type {
  AdjustmentStatus,
  MovementType,
  StockBalance,
  StockCondition,
} from "../types/stock.type";

const balanceColumns = {
  stockBalanceId: stockBalances.stockBalanceId,
  itemId: stockBalances.itemId,
  condition: stockBalances.condition,
  quantityOnHand: stockBalances.quantityOnHand,
  isIncomplete: stockBalances.isIncomplete,
};

export async function itemExists(tx: Tx, itemId: number): Promise<boolean> {
  const [row] = await tx
    .select({ itemId: items.itemId })
    .from(items)
    .where(eq(items.itemId, itemId));

  return Boolean(row);
}

/** Creates the usable, damaged, and hold rows for an item if they are missing. */
export async function insertMissingBalances(tx: Tx, itemId: number): Promise<void> {
  await tx
    .insert(stockBalances)
    .values([
      { itemId, condition: "usable" },
      { itemId, condition: "damaged" },
      { itemId, condition: "hold" },
    ])
    .onConflictDoNothing();
}

/** Reads one balance row and holds a row lock on it until the transaction ends. */
export async function lockBalance(
  tx: Tx,
  itemId: number,
  condition: StockCondition,
): Promise<StockBalance | null> {
  const [row] = await tx
    .select(balanceColumns)
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, condition)))
    .for("update");

  return row ?? null;
}

export async function lockBalanceById(
  tx: Tx,
  stockBalanceId: number,
): Promise<StockBalance | null> {
  const [row] = await tx
    .select(balanceColumns)
    .from(stockBalances)
    .where(eq(stockBalances.stockBalanceId, stockBalanceId))
    .for("update");

  return row ?? null;
}

export async function addToBalance(
  tx: Tx,
  stockBalanceId: number,
  quantityDelta: string,
): Promise<void> {
  await tx
    .update(stockBalances)
    .set({
      quantityOnHand: sql`${stockBalances.quantityOnHand} + ${quantityDelta}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(stockBalances.stockBalanceId, stockBalanceId));
}

export async function setBalanceIncomplete(
  tx: Tx,
  stockBalanceId: number,
  isIncomplete: boolean,
): Promise<void> {
  await tx
    .update(stockBalances)
    .set({ isIncomplete, updatedAt: new Date() })
    .where(eq(stockBalances.stockBalanceId, stockBalanceId));
}

export async function sumActiveReservations(
  tx: Tx,
  stockBalanceId: number,
): Promise<string> {
  const [row] = await tx
    .select({
      reserved: sql<string>`coalesce(sum(${stockReservations.reservedQty}), 0)::numeric(14, 3)`,
    })
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.stockBalanceId, stockBalanceId),
        eq(stockReservations.status, "active"),
      ),
    );

  return row.reserved;
}

/**
 * Inserts the ledger row for an event. Returns null when the event key, or the
 * movement being reversed, has been used already, so the caller can refuse.
 */
export async function insertMovement(
  tx: Tx,
  movement: {
    stockBalanceId: number;
    movementType: MovementType;
    quantityDelta: string;
    eventKey: string;
    unitCost?: string | null;
    supplierReceiptLineId?: number;
    dispatchLineId?: number;
    returnLineId?: number;
    adjustmentId?: number;
    reversesMovementId?: number;
  },
): Promise<number | null> {
  const [row] = await tx
    .insert(stockMovements)
    .values(movement)
    .onConflictDoNothing()
    .returning({ movementId: stockMovements.movementId });

  return row?.movementId ?? null;
}

export async function findMovementById(tx: Tx, movementId: number) {
  const [row] = await tx
    .select({
      movementId: stockMovements.movementId,
      stockBalanceId: stockMovements.stockBalanceId,
      movementType: stockMovements.movementType,
      quantityDelta: stockMovements.quantityDelta,
      unitCost: stockMovements.unitCost,
    })
    .from(stockMovements)
    .where(eq(stockMovements.movementId, movementId));

  return row ?? null;
}

export async function movementExists(tx: Tx, eventKey: string): Promise<boolean> {
  const [row] = await tx
    .select({ movementId: stockMovements.movementId })
    .from(stockMovements)
    .where(eq(stockMovements.eventKey, eventKey));

  return Boolean(row);
}

/** Quantity already sent back to the supplier from one receipt line. */
export async function sumSupplierReturns(
  tx: Tx,
  supplierReceiptLineId: number,
): Promise<string> {
  const [row] = await tx
    .select({
      returned: sql<string>`coalesce(-sum(${stockMovements.quantityDelta}), 0)::numeric(14, 3)`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.supplierReceiptLineId, supplierReceiptLineId),
        eq(stockMovements.movementType, "supplier_return"),
      ),
    );

  return row.returned;
}

// Average cost. The arithmetic stays in SQL so it uses exact numerics.

export async function findAverageCost(tx: Tx, itemId: number): Promise<string> {
  const [row] = await tx
    .select({ averageCost: items.averageCost })
    .from(items)
    .where(eq(items.itemId, itemId));

  return row.averageCost;
}

/** Moving weighted average after `quantity` arrives at `unitCost`. */
export async function averageCostIn(
  tx: Tx,
  itemId: number,
  onHandBefore: string,
  quantity: string,
  unitCost: string,
): Promise<void> {
  const before = sql`greatest(${onHandBefore}::numeric, 0)`;

  await tx
    .update(items)
    .set({
      averageCost: sql`round(
        (${before} * ${items.averageCost} + ${quantity}::numeric * ${unitCost}::numeric)
        / (${before} + ${quantity}::numeric), 4)`,
    })
    .where(eq(items.itemId, itemId));
}

/** Takes `quantity` at `unitCost` back out of the average. */
export async function averageCostOut(
  tx: Tx,
  itemId: number,
  onHandBefore: string,
  quantity: string,
  unitCost: string,
): Promise<void> {
  const remaining = sql`(${onHandBefore}::numeric - ${quantity}::numeric)`;

  await tx
    .update(items)
    .set({
      averageCost: sql`case when ${remaining} > 0 then greatest(round(
        (${onHandBefore}::numeric * ${items.averageCost} - ${quantity}::numeric * ${unitCost}::numeric)
        / ${remaining}, 4), 0) else ${items.averageCost} end`,
    })
    .where(eq(items.itemId, itemId));
}

// Reservations

export async function insertReservation(
  tx: Tx,
  reservation: { requisitionLineId: number; stockBalanceId: number; reservedQty: string },
): Promise<number> {
  const [row] = await tx
    .insert(stockReservations)
    .values(reservation)
    .returning({ reservationId: stockReservations.reservationId });

  return row.reservationId;
}

export async function findReservation(tx: Tx, reservationId: number) {
  const [row] = await tx
    .select({
      reservationId: stockReservations.reservationId,
      requisitionLineId: stockReservations.requisitionLineId,
      stockBalanceId: stockReservations.stockBalanceId,
      reservedQty: stockReservations.reservedQty,
      status: stockReservations.status,
      itemId: stockBalances.itemId,
    })
    .from(stockReservations)
    .innerJoin(
      stockBalances,
      eq(stockBalances.stockBalanceId, stockReservations.stockBalanceId),
    )
    .where(eq(stockReservations.reservationId, reservationId));

  return row ?? null;
}

export async function updateReservation(
  tx: Tx,
  reservationId: number,
  changes: { status: "consumed" | "released"; reservedQty?: string },
): Promise<void> {
  await tx
    .update(stockReservations)
    .set(changes)
    .where(eq(stockReservations.reservationId, reservationId));
}

// Source documents. The stock service reads quantities from these rows, so a
// caller cannot post a figure that differs from the document.

export async function findRequisitionLineItem(
  tx: Tx,
  requisitionLineId: number,
): Promise<number | null> {
  const [row] = await tx
    .select({ itemId: requisitionLines.itemId })
    .from(requisitionLines)
    .where(eq(requisitionLines.requisitionLineId, requisitionLineId));

  return row?.itemId ?? null;
}

export async function findDispatchLine(tx: Tx, dispatchLineId: number) {
  const [row] = await tx
    .select({
      dispatchLineId: dispatchLines.dispatchLineId,
      requisitionLineId: dispatchLines.requisitionLineId,
      itemId: requisitionLines.itemId,
      sentQty: dispatchLines.sentQty,
      acceptedQty: dispatchLines.acceptedQty,
      returnedQty: sql<string>`coalesce((
        select sum(${returnLines.returnedQty}) from ${returnLines}
        where ${returnLines.dispatchLineId} = ${dispatchLines.dispatchLineId}
      ), 0)::numeric(14, 3)`,
    })
    .from(dispatchLines)
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, dispatchLines.requisitionLineId),
    )
    .where(eq(dispatchLines.dispatchLineId, dispatchLineId));

  return row ?? null;
}

export async function addAcceptedQuantity(
  tx: Tx,
  dispatchLineId: number,
  quantity: string,
): Promise<void> {
  await tx
    .update(dispatchLines)
    .set({ acceptedQty: sql`${dispatchLines.acceptedQty} + ${quantity}::numeric` })
    .where(eq(dispatchLines.dispatchLineId, dispatchLineId));
}

export async function findReturnLine(tx: Tx, returnLineId: number) {
  const [row] = await tx
    .select({
      returnLineId: returnLines.returnLineId,
      dispatchLineId: returnLines.dispatchLineId,
      returnedQty: returnLines.returnedQty,
    })
    .from(returnLines)
    .where(eq(returnLines.returnLineId, returnLineId));

  return row ?? null;
}

export async function findSupplierReceiptLine(tx: Tx, supplierReceiptLineId: number) {
  const [row] = await tx
    .select({
      supplierReceiptLineId: supplierReceiptLines.supplierReceiptLineId,
      acceptedQty: supplierReceiptLines.acceptedQty,
      unitPrice: purchaseOrderLines.unitPrice,
      itemId: purchaseRequisitionLines.itemId,
    })
    .from(supplierReceiptLines)
    .innerJoin(
      purchaseOrderLines,
      eq(purchaseOrderLines.purchaseOrderLineId, supplierReceiptLines.purchaseOrderLineId),
    )
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .where(eq(supplierReceiptLines.supplierReceiptLineId, supplierReceiptLineId));

  return row ?? null;
}

export async function findAdjustmentForPosting(
  tx: Tx,
  adjustmentId: number,
): Promise<{
  adjustmentId: number;
  stockBalanceId: number;
  recordedQty: string;
  countedQty: string;
  status: AdjustmentStatus;
} | null> {
  const [row] = await tx
    .select({
      adjustmentId: stockAdjustments.adjustmentId,
      stockBalanceId: stockAdjustments.stockBalanceId,
      recordedQty: stockAdjustments.recordedQty,
      countedQty: stockAdjustments.countedQty,
      status: stockAdjustments.status,
    })
    .from(stockAdjustments)
    .where(eq(stockAdjustments.adjustmentId, adjustmentId));

  return row ?? null;
}
