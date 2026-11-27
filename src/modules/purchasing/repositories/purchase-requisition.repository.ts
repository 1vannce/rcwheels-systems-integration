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
  PurchaseOrderStatus,
  PurchaseRequisitionCoverageLineDto,
  PurchaseRequisitionDto,
  PurchaseRequisitionReason,
  PurchaseRequisitionStatus,
} from "../types/purchasing.dto";

/** PO states that count as committed demand against a PR line. */
const COMMITTED_PURCHASE_ORDER_STATUSES = [
  "approved",
  "placed",
  "partially_received",
  "closed",
] as const satisfies readonly PurchaseOrderStatus[];

/** PO states that reserve quantity but do not yet cover the PR line. */
const DRAFT_PURCHASE_ORDER_STATUSES = [
  "pending_approval",
  "for_revision",
] as const satisfies readonly PurchaseOrderStatus[];

/**
 * Reads a PR header under a row lock so two PO drafts cannot both pass the
 * open-status check and claim the same demand.
 */
export async function lockPurchaseRequisitionForOrder(
  tx: Tx,
  purchaseRequisitionId: number,
): Promise<{
  purchaseRequisitionId: number;
  requestedBy: number;
  status: PurchaseRequisitionStatus;
} | null> {
  const [row] = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      requestedBy: purchaseRequisitions.requestedBy,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitions)
    .where(
      eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId),
    )
    .for("update");

  return row ?? null;
}

/** The PR header shown above the PO editor. */
export async function findPurchaseRequisitionSummary(
  tx: Tx,
  purchaseRequisitionId: number,
): Promise<{
  purchaseRequisitionId: number;
  requestedByName: string;
  requestedAt: Date;
  requestReason: PurchaseRequisitionReason;
  status: PurchaseRequisitionStatus;
} | null> {
  const [row] = await tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      requestedByName: users.fullName,
      requestedAt: purchaseRequisitions.requestedAt,
      requestReason: purchaseRequisitions.requestReason,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitions)
    .innerJoin(users, eq(users.userId, purchaseRequisitions.requestedBy))
    .where(
      eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId),
    )
    .limit(1);

  return row ?? null;
}

/** Current statuses for the PRs linked to a purchase order event. */
export async function findPurchaseRequisitionStatuses(
  tx: Tx,
  purchaseRequisitionIds: readonly number[],
): Promise<
  {
    purchaseRequisitionId: number;
    status: PurchaseRequisitionStatus;
  }[]
> {
  const ids = [...new Set(purchaseRequisitionIds)];

  if (ids.length === 0) {
    return [];
  }

  return tx
    .select({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitions)
    .where(inArray(purchaseRequisitions.purchaseRequisitionId, ids));
}

/** Inserts a purchase requisition header and returns its new ID. */
export async function insertPurchaseRequisition(
  tx: Tx,
  input: { requestedBy: number; requestReason: PurchaseRequisitionReason },
): Promise<number> {
  const [row] = await tx
    .insert(purchaseRequisitions)
    .values(input)
    .returning({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
    });

  return row.purchaseRequisitionId;
}

/** Inserts the lines of one purchase requisition. */
export async function insertPurchaseRequisitionLines(
  tx: Tx,
  purchaseRequisitionId: number,
  lines: readonly {
    requisitionLineId: number;
    itemId: number;
    requestedQty: string;
  }[],
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
  {
    purchaseRequisitionId: number;
    requisitionLineId: number;
    requestedQty: string;
  }[]
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
      eq(
        purchaseRequisitions.purchaseRequisitionId,
        purchaseRequisitionLines.purchaseRequisitionId,
      ),
    )
    .where(
      and(
        inArray(purchaseRequisitionLines.requisitionLineId, [
          ...new Set(requisitionLineIds),
        ]),
        eq(purchaseRequisitions.status, "open"),
      ),
    );

  return rows.filter(
    (
      row,
    ): row is {
      purchaseRequisitionId: number;
      requisitionLineId: number;
      requestedQty: string;
    } => row.requisitionLineId !== null,
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
        inArray(purchaseRequisitionLines.requisitionLineId, [
          ...new Set(requisitionLineIds),
        ]),
        inArray(purchaseOrders.status, [
          "approved",
          "placed",
          "partially_received",
        ]),
      ),
    )
    .groupBy(purchaseRequisitionLines.requisitionLineId);

  return rows.filter(
    (row): row is { requisitionLineId: number; allocatedQty: string } =>
      row.requisitionLineId !== null,
  );
}

/**
 * Coverage of every PR line from active PO lines.
 *
 * A draft reserves its quantity so another draft cannot claim the same demand,
 * but only an approved (or later) PO commits demand and can mark the PR
 * covered. Cancelled POs and cancelled PO quantities are never counted.
 */
export async function findPurchaseRequisitionCoverage(
  tx: Tx,
  purchaseRequisitionId: number,
): Promise<PurchaseRequisitionCoverageLineDto[]> {
  const coverageFor = (
    statuses: readonly PurchaseOrderStatus[],
  ) => sql<string>`coalesce((
    select sum(greatest(
      ${purchaseOrderLines.orderedQty} - ${purchaseOrderLines.cancelledQty},
      0
    ))
    from ${purchaseOrderLines}
    inner join ${purchaseOrders}
      on ${purchaseOrders.purchaseOrderId} = ${purchaseOrderLines.purchaseOrderId}
    where ${purchaseOrderLines.purchaseRequisitionLineId} = ${purchaseRequisitionLines.purchaseRequisitionLineId}
      and ${inArray(purchaseOrders.status, [...statuses])}
  ), 0)::numeric(14, 3)`;

  const committedQty = coverageFor(COMMITTED_PURCHASE_ORDER_STATUSES);

  return (
    tx
      .select({
        purchaseRequisitionLineId:
          purchaseRequisitionLines.purchaseRequisitionLineId,
        requestedQty: purchaseRequisitionLines.requestedQty,
        committedQty,
        draftQty: coverageFor(DRAFT_PURCHASE_ORDER_STATUSES),
        remainingQty: sql<string>`greatest(
        ${purchaseRequisitionLines.requestedQty} - ${committedQty},
        0
      )::numeric(14, 3)`,
      })
      .from(purchaseRequisitionLines)
      // The join keeps Drizzle from stripping table qualifiers inside the
      // correlated coverage subqueries of a single-table select.
      .innerJoin(
        purchaseRequisitions,
        eq(
          purchaseRequisitions.purchaseRequisitionId,
          purchaseRequisitionLines.purchaseRequisitionId,
        ),
      )
      .where(
        eq(
          purchaseRequisitionLines.purchaseRequisitionId,
          purchaseRequisitionId,
        ),
      )
      .orderBy(asc(purchaseRequisitionLines.purchaseRequisitionLineId))
  );
}

/** Moves a PR between open and covered after its coverage is recalculated. */
export async function setPurchaseRequisitionStatus(
  tx: Tx,
  purchaseRequisitionId: number,
  status: "open" | "covered",
): Promise<void> {
  await tx
    .update(purchaseRequisitions)
    .set({ status })
    .where(
      eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId),
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
      eq(
        purchaseRequisitionLines.purchaseRequisitionId,
        purchaseRequisitions.purchaseRequisitionId,
      ),
    )
    .innerJoin(
      requisitionLines,
      eq(
        requisitionLines.requisitionLineId,
        purchaseRequisitionLines.requisitionLineId,
      ),
    )
    .where(
      and(
        eq(requisitionLines.requisitionId, requisitionId),
        eq(purchaseRequisitions.status, "open"),
      ),
    )
    .orderBy(
      asc(purchaseRequisitions.requestedAt),
      asc(purchaseRequisitions.purchaseRequisitionId),
    )
    .limit(1);

  return row ?? null;
}

export async function countOpenPurchaseRequisitionRows(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseRequisitions)
    .where(eq(purchaseRequisitions.status, "open"));

  return row?.count ?? 0;
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
    .orderBy(
      asc(purchaseRequisitions.requestedAt),
      asc(purchaseRequisitions.purchaseRequisitionId),
    )
    .limit(limit);

  if (headers.length === 0) {
    return [];
  }

  const ids = headers.map((header) => header.purchaseRequisitionId);
  const lines = await tx
    .select({
      purchaseRequisitionLineId:
        purchaseRequisitionLines.purchaseRequisitionLineId,
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
      eq(
        requisitionLines.requisitionLineId,
        purchaseRequisitionLines.requisitionLineId,
      ),
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
