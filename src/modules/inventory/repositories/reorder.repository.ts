import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  auditLog,
  items,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockBalances,
  stockReservations,
  supplierReceiptLines,
} from "@/db/schema";

import type { PurchaseOrderCoverage, PurchaseRequisitionCoverage } from "../types/reorder.type";

/** PO states whose outstanding quantity is still on its way. */
const OPEN_PURCHASE_ORDER_STATUSES = [
  "pending_approval",
  "for_revision",
  "approved",
  "placed",
  "partially_received",
] as const;

export async function findItemForReorder(
  tx: Tx,
  itemId: number,
): Promise<{ itemCode: string; itemName: string; unit: string; reorderPoint: string } | null> {
  const [row] = await tx
    .select({
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      reorderPoint: items.reorderPoint,
    })
    .from(items)
    .where(eq(items.itemId, itemId));

  return row ?? null;
}

export const REORDER_ALERT_ACTION = "inventory.reorder-alert";

/** True once any reorder alert has been recorded for the item. */
export async function hasReorderAlert(tx: Tx, itemId: number): Promise<boolean> {
  const [row] = await tx
    .select({ auditId: auditLog.auditId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "items"),
        eq(auditLog.entityId, itemId),
        eq(auditLog.action, REORDER_ALERT_ACTION),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/** Usable on hand minus active reservations. */
export async function findAvailableQuantity(tx: Tx, itemId: number): Promise<string> {
  const reserved = sql<string>`coalesce((
    select sum(${stockReservations.reservedQty})
    from ${stockReservations}
    where ${stockReservations.stockBalanceId} = ${stockBalances.stockBalanceId}
      and ${stockReservations.status} = 'active'
  ), 0)`;

  const [row] = await tx
    .select({
      available: sql<string>`(${stockBalances.quantityOnHand} - ${reserved})::numeric(14, 3)`,
    })
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, "usable")));

  return row?.available ?? "0.000";
}

/** Open POs for the item with their outstanding (ordered - cancelled - accepted) quantity. */
export async function findOpenPurchaseOrderCoverage(
  tx: Tx,
  itemId: number,
): Promise<PurchaseOrderCoverage[]> {
  const accepted = sql`coalesce((
    select sum(${supplierReceiptLines.acceptedQty})
    from ${supplierReceiptLines}
    where ${supplierReceiptLines.purchaseOrderLineId} = ${purchaseOrderLines.purchaseOrderLineId}
  ), 0)`;
  const outstanding = sql<string>`coalesce(sum(greatest(
    ${purchaseOrderLines.orderedQty} - ${purchaseOrderLines.cancelledQty} - ${accepted},
    0
  )), 0)::numeric(14, 3)`;

  const rows = await tx
    .select({
      purchaseOrderId: purchaseOrders.purchaseOrderId,
      status: purchaseOrders.status,
      outstandingQty: outstanding,
    })
    .from(purchaseOrderLines)
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.purchaseOrderId, purchaseOrderLines.purchaseOrderId),
    )
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .where(
      and(
        eq(purchaseRequisitionLines.itemId, itemId),
        inArray(purchaseOrders.status, [...OPEN_PURCHASE_ORDER_STATUSES]),
      ),
    )
    .groupBy(purchaseOrders.purchaseOrderId, purchaseOrders.status)
    .orderBy(asc(purchaseOrders.purchaseOrderId));

  return rows.filter((row) => Number(row.outstandingQty) > 0);
}

/**
 * Open PRs for the item with the quantity not yet put on a PO, so a PR and the
 * PO made from it are not counted twice.
 */
export async function findOpenPurchaseRequisitionCoverage(
  tx: Tx,
  itemId: number,
): Promise<PurchaseRequisitionCoverage[]> {
  const ordered = sql`coalesce((
    select sum(${purchaseOrderLines.orderedQty} - ${purchaseOrderLines.cancelledQty})
    from ${purchaseOrderLines}
    inner join ${purchaseOrders}
      on ${purchaseOrders.purchaseOrderId} = ${purchaseOrderLines.purchaseOrderId}
    where ${purchaseOrderLines.purchaseRequisitionLineId} = ${purchaseRequisitionLines.purchaseRequisitionLineId}
      and ${purchaseOrders.status} <> 'cancelled'
  ), 0)`;
  const unordered = sql<string>`coalesce(sum(greatest(
    ${purchaseRequisitionLines.requestedQty} - ${ordered},
    0
  )), 0)::numeric(14, 3)`;

  const rows = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      unorderedQty: unordered,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(
      purchaseRequisitions,
      eq(
        purchaseRequisitions.purchaseRequisitionId,
        purchaseRequisitionLines.purchaseRequisitionId,
      ),
    )
    .where(
      and(
        eq(purchaseRequisitionLines.itemId, itemId),
        eq(purchaseRequisitions.status, "open"),
      ),
    )
    .groupBy(purchaseRequisitions.purchaseRequisitionId)
    .orderBy(asc(purchaseRequisitions.purchaseRequisitionId));

  return rows.filter((row) => Number(row.unorderedQty) > 0);
}
