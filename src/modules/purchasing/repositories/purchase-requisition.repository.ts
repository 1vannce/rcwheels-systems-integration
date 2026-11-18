import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  items,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  users,
  supplierReceiptLines,
} from "@/db/schema";

import type {
  PurchaseRequisitionDto,
  PurchaseRequisitionReason,
  PurchaseRequisitionStatus,
} from "../types/purchasing.dto";

/** Inserts a purchase requisition header and returns its new ID. */
export async function insertPurchaseRequisition(
  tx: Tx,
  input: { requestedBy: number; requestReason: PurchaseRequisitionReason },
): Promise<number> {
  const [row] = await tx
    .insert(purchaseRequisitions)
    .values(input)
    .returning({ purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId });

  return row.purchaseRequisitionId;
}

/** Inserts the lines of one purchase requisition. */
export async function insertPurchaseRequisitionLines(
  tx: Tx,
  purchaseRequisitionId: number,
  lines: readonly { requisitionLineId: number; itemId: number; requestedQty: string }[],
): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  await tx.insert(purchaseRequisitionLines).values(
    lines.map((line) => ({
      purchaseRequisitionId,
      requisitionLineId: line.requisitionLineId,
      itemId: line.itemId,
      requestedQty: line.requestedQty,
    })),
  );
}

/**
 * Open PR lines that already cover any of the given requisition lines. A
 * second PR for the same line would create duplicate demand before Purchasing
 * has turned the first one into a PO.
 */
export async function findOpenPurchaseRequisitionLines(
  tx: Tx,
  requisitionLineIds: readonly number[],
): Promise<
  { purchaseRequisitionId: number; requisitionLineId: number; requestedQty: string }[]
> {
  if (requisitionLineIds.length === 0) {
    return [];
  }

  const rows = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      requisitionLineId: purchaseRequisitionLines.requisitionLineId,
      requestedQty: purchaseRequisitionLines.requestedQty,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(
      purchaseRequisitions,
      eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionLines.purchaseRequisitionId),
    )
    .where(
      and(
        inArray(purchaseRequisitionLines.requisitionLineId, [...new Set(requisitionLineIds)]),
        eq(purchaseRequisitions.status, "open"),
      ),
    );

  return rows.filter(
    (row): row is { purchaseRequisitionId: number; requisitionLineId: number; requestedQty: string } =>
      row.requisitionLineId !== null,
  );
}

/**
 * Committed outstanding PO quantity per requisition line. Only approved,
 * placed, and partially received POs allocate demand; a PO still waiting for
 * Accounting does not.
 */
export async function findAllocatedPurchaseQuantities(
  tx: Tx,
  requisitionLineIds: readonly number[],
): Promise<{ requisitionLineId: number; allocatedQty: string }[]> {
  if (requisitionLineIds.length === 0) {
    return [];
  }

  const acceptedOnLine = sql<string>`coalesce((
    select sum(${supplierReceiptLines.acceptedQty})
    from ${supplierReceiptLines}
    where ${supplierReceiptLines.purchaseOrderLineId} = ${purchaseOrderLines.purchaseOrderLineId}
  ), 0)`;

  const outstandingOnLine = sql<string>`greatest(
    ${purchaseOrderLines.orderedQty}
    - ${purchaseOrderLines.cancelledQty}
    - ${acceptedOnLine},
    0
  )`;

  const rows = await tx
    .select({
      requisitionLineId: purchaseRequisitionLines.requisitionLineId,
      allocatedQty: sql<string>`coalesce(sum(${outstandingOnLine}), 0)::numeric(14, 3)`,
    })
    .from(purchaseOrderLines)
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.purchaseOrderId, purchaseOrderLines.purchaseOrderId),
    )
    .where(
      and(
        inArray(purchaseRequisitionLines.requisitionLineId, [...new Set(requisitionLineIds)]),
        inArray(purchaseOrders.status, ["approved", "placed", "partially_received"]),
      ),
    )
    .groupBy(purchaseRequisitionLines.requisitionLineId);

  return rows.filter(
    (row): row is { requisitionLineId: number; allocatedQty: string } =>
      row.requisitionLineId !== null,
  );
}

/** The oldest open PR touching a requisition, used by the detail-page context. */
export async function findOpenPurchaseRequisitionForRequisition(
  tx: Tx,
  requisitionId: number,
): Promise<{
  purchaseRequisitionId: number;
  requestedAt: Date;
  status: PurchaseRequisitionStatus;
} | null> {
  const [row] = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      requestedAt: purchaseRequisitions.requestedAt,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitions)
    .innerJoin(
      purchaseRequisitionLines,
      eq(purchaseRequisitionLines.purchaseRequisitionId, purchaseRequisitions.purchaseRequisitionId),
    )
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, purchaseRequisitionLines.requisitionLineId),
    )
    .where(
      and(
        eq(requisitionLines.requisitionId, requisitionId),
        eq(purchaseRequisitions.status, "open"),
      ),
    )
    .orderBy(asc(purchaseRequisitions.requestedAt), asc(purchaseRequisitions.purchaseRequisitionId))
    .limit(1);

  return row ?? null;
}

/** Open PRs with their lines, oldest first, for the purchasing queue. */
export async function findOpenPurchaseRequisitions(
  tx: Tx,
  limit: number,
): Promise<PurchaseRequisitionDto[]> {
  const headers = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      requestedBy: purchaseRequisitions.requestedBy,
      requestedByName: users.fullName,
      requestedAt: purchaseRequisitions.requestedAt,
      requestReason: purchaseRequisitions.requestReason,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitions)
    .innerJoin(users, eq(users.userId, purchaseRequisitions.requestedBy))
    .where(eq(purchaseRequisitions.status, "open"))
    .orderBy(asc(purchaseRequisitions.requestedAt), asc(purchaseRequisitions.purchaseRequisitionId))
    .limit(limit);

  if (headers.length === 0) {
    return [];
  }

  const ids = headers.map((header) => header.purchaseRequisitionId);
  const lines = await tx
    .select({
      purchaseRequisitionLineId: purchaseRequisitionLines.purchaseRequisitionLineId,
      purchaseRequisitionId: purchaseRequisitionLines.purchaseRequisitionId,
      requisitionLineId: purchaseRequisitionLines.requisitionLineId,
      requisitionId: requisitionLines.requisitionId,
      itemId: items.itemId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      requestedQty: purchaseRequisitionLines.requestedQty,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(items, eq(items.itemId, purchaseRequisitionLines.itemId))
    .leftJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, purchaseRequisitionLines.requisitionLineId),
    )
    .where(inArray(purchaseRequisitionLines.purchaseRequisitionId, ids))
    .orderBy(asc(purchaseRequisitionLines.purchaseRequisitionLineId));

  const linesByPr = new Map<number, PurchaseRequisitionDto["lines"]>();

  for (const line of lines) {
    const list = linesByPr.get(line.purchaseRequisitionId) ?? [];
    list.push(line);
    linesByPr.set(line.purchaseRequisitionId, list);
  }

  return headers.map((header) => ({
    ...header,
    lines: linesByPr.get(header.purchaseRequisitionId) ?? [],
  }));
}
