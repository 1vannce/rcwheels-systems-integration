import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";
import {
  items,
  purchaseOrderLines,
  purchaseOrderRevisions,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  supplierReceiptLines,
  suppliers,
  users,
} from "@/db/schema";

import type {
  PurchaseOrderDetailDto,
  PurchaseOrderDto,
  PurchaseOrderLineDto,
  PurchaseOrderRevisionDto,
  PurchaseOrderSnapshot,
  PurchaseOrderSourceLineDto,
  PurchaseOrderStatus,
} from "../types/purchasing.dto";

/**
 * PO states whose ordered quantity counts against a PR line's remaining
 * orderable quantity. Closed POs count their accepted part, so a shortfall
 * created by a cancelled balance is not ordered twice.
 */
const ORDERED_PURCHASE_ORDER_STATUSES = [
  "pending_approval",
  "for_revision",
  "approved",
  "placed",
  "partially_received",
  "closed",
] as const satisfies readonly PurchaseOrderStatus[];

const approver = alias(users, "purchase_order_approver");
const canceller = alias(users, "purchase_order_canceller");
const revisionReviewer = alias(users, "purchase_order_revision_reviewer");

const purchaseOrderColumns = {
  purchaseOrderId: purchaseOrders.purchaseOrderId,
  supplierId: purchaseOrders.supplierId,
  supplierName: suppliers.supplierName,
  preparedBy: purchaseOrders.preparedBy,
  preparedByName: users.fullName,
  approvedBy: purchaseOrders.approvedBy,
  approvedByName: approver.fullName,
  orderedAt: purchaseOrders.orderedAt,
  approvedAt: purchaseOrders.approvedAt,
  status: purchaseOrders.status,
  currentVersion: purchaseOrders.currentVersion,
  deliveryTerms: purchaseOrders.deliveryTerms,
  supplierConfirmedAt: purchaseOrders.supplierConfirmedAt,
  cancelledBy: purchaseOrders.cancelledBy,
  cancelledByName: canceller.fullName,
  cancelledAt: purchaseOrders.cancelledAt,
  cancellationReason: purchaseOrders.cancellationReason,
};

/** Accepted quantity from supplier receipts; zero until receiving is built. */
const acceptedQtyForLine = sql<string>`coalesce((
  select sum(${supplierReceiptLines.acceptedQty})
  from ${supplierReceiptLines}
  where ${supplierReceiptLines.purchaseOrderLineId} = ${purchaseOrderLines.purchaseOrderLineId}
), 0)::numeric(14, 3)`;

const outstandingQtyForLine = sql<string>`greatest(
  ${purchaseOrderLines.orderedQty}
  - ${purchaseOrderLines.cancelledQty}
  - ${acceptedQtyForLine},
  0
)::numeric(14, 3)`;

/**
 * PR lines with the quantity already allocated to active PO drafts or POs.
 * This is the source list for preparing a PO; it excludes closed PRs and
 * cancelled POs.
 */
export async function findPurchaseRequisitionLinesForOrder(
  tx: Tx,
  purchaseRequisitionId: number,
  options: {
    /** Leave this PO's own active lines out when editing an existing PO. */
    excludePurchaseOrderId?: number;
    /** Editing an existing PO may continue after the PR is covered. */
    requireOpen?: boolean;
  } = {},
): Promise<PurchaseOrderSourceLineDto[]> {
  const excludePo =
    options.excludePurchaseOrderId === undefined
      ? sql``
      : sql`and ${purchaseOrderLines.purchaseOrderId} <> ${options.excludePurchaseOrderId}`;

  const activeCoverage = sql<string>`coalesce((
    select sum(greatest(
      ${purchaseOrderLines.orderedQty} - ${purchaseOrderLines.cancelledQty},
      0
    ))
    from ${purchaseOrderLines}
    inner join ${purchaseOrders}
      on ${purchaseOrders.purchaseOrderId} = ${purchaseOrderLines.purchaseOrderId}
    where ${purchaseOrderLines.purchaseRequisitionLineId} = ${purchaseRequisitionLines.purchaseRequisitionLineId}
      and ${inArray(purchaseOrders.status, ORDERED_PURCHASE_ORDER_STATUSES)}
      ${excludePo}
  ), 0)::numeric(14, 3)`;

  const conditions = [
    eq(purchaseRequisitionLines.purchaseRequisitionId, purchaseRequisitionId),
    ...(options.requireOpen === false ? [] : [eq(purchaseRequisitions.status, "open")]),
  ];

  return tx
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
      allocatedQty: activeCoverage,
      remainingQty: sql<string>`greatest(
        ${purchaseRequisitionLines.requestedQty} - ${activeCoverage},
        0
      )::numeric(14, 3)`,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(
      purchaseRequisitions,
      eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionLines.purchaseRequisitionId),
    )
    .leftJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, purchaseRequisitionLines.requisitionLineId),
    )
    .innerJoin(items, eq(items.itemId, purchaseRequisitionLines.itemId))
    .where(and(...conditions))
    .orderBy(asc(purchaseRequisitionLines.purchaseRequisitionLineId));
}

/** The create-PO source list; only open PRs are valid. */
export async function findOpenPurchaseRequisitionLinesForOrder(
  tx: Tx,
  purchaseRequisitionId: number,
): Promise<PurchaseOrderSourceLineDto[]> {
  return findPurchaseRequisitionLinesForOrder(tx, purchaseRequisitionId, {
    requireOpen: true,
  });
}

/** Locks PR lines in ascending ID order so two PO drafts cannot claim the same demand. */
export async function lockPurchaseRequisitionLines(
  tx: Tx,
  purchaseRequisitionLineIds: readonly number[],
): Promise<{ purchaseRequisitionLineId: number }[]> {
  const ids = [...new Set(purchaseRequisitionLineIds)].sort((a, b) => a - b);

  if (ids.length === 0) {
    return [];
  }

  return tx
    .select({
      purchaseRequisitionLineId: purchaseRequisitionLines.purchaseRequisitionLineId,
    })
    .from(purchaseRequisitionLines)
    .where(inArray(purchaseRequisitionLines.purchaseRequisitionLineId, ids))
    .orderBy(asc(purchaseRequisitionLines.purchaseRequisitionLineId))
    .for("update");
}

/**
 * Reads the PO header under a row lock so Accounting cannot approve and return
 * the same version at the same time.
 */
export async function lockPurchaseOrder(
  tx: Tx,
  purchaseOrderId: number,
): Promise<{
  purchaseOrderId: number;
  supplierId: number;
  preparedBy: number;
  approvedBy: number | null;
  status: PurchaseOrderStatus;
  currentVersion: number;
  cancelledAt: Date | null;
} | null> {
  const [row] = await tx
    .select({
      purchaseOrderId: purchaseOrders.purchaseOrderId,
      supplierId: purchaseOrders.supplierId,
      preparedBy: purchaseOrders.preparedBy,
      approvedBy: purchaseOrders.approvedBy,
      status: purchaseOrders.status,
      currentVersion: purchaseOrders.currentVersion,
      cancelledAt: purchaseOrders.cancelledAt,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
    .for("update");

  return row ?? null;
}

/** Marks the current PO version approved by Accounting. */
export async function markPurchaseOrderApproved(
  tx: Tx,
  purchaseOrderId: number,
  approvedBy: number,
  approvedAt: Date,
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({
      status: "approved",
      approvedBy,
      approvedAt,
    })
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

/** Marks an approved PO as placed with the supplier. */
export async function markPurchaseOrderPlaced(
  tx: Tx,
  purchaseOrderId: number,
  orderedAt: Date,
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({ status: "placed", orderedAt })
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

/**
 * Replaces the cancelled quantity on each selected line. The caller passes
 * lines whose remaining balance is above zero, so this is a one-time increase.
 */
export async function setPurchaseOrderLineCancelledQuantities(
  tx: Tx,
  purchaseOrderId: number,
  lines: readonly { purchaseOrderLineId: number; cancelledQty: string }[],
): Promise<void> {
  for (const line of lines) {
    await tx
      .update(purchaseOrderLines)
      .set({ cancelledQty: line.cancelledQty })
      .where(
        and(
          eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId),
          eq(purchaseOrderLines.purchaseOrderLineId, line.purchaseOrderLineId),
        ),
      );
  }
}

/**
 * Records Accounting's cancellation on the header and sets the terminal status.
 * A partially received PO becomes closed so its accepted quantity still counts
 * toward PR coverage; an unreceived PO becomes cancelled.
 */
export async function markPurchaseOrderBalanceCancelled(
  tx: Tx,
  input: {
    purchaseOrderId: number;
    cancelledBy: number;
    cancelledAt: Date;
    cancellationReason: string;
    status: "closed" | "cancelled";
  },
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({
      status: input.status,
      cancelledBy: input.cancelledBy,
      cancelledAt: input.cancelledAt,
      cancellationReason: input.cancellationReason,
    })
    .where(eq(purchaseOrders.purchaseOrderId, input.purchaseOrderId));
}

/** Marks an unapproved PO draft as cancelled so its lines stop allocating demand. */
export async function discardPurchaseOrderDraft(
  tx: Tx,
  purchaseOrderId: number,
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({ status: "cancelled" })
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

/** Marks the current PO version returned for revision and clears approval. */
export async function markPurchaseOrderForRevision(
  tx: Tx,
  purchaseOrderId: number,
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({
      status: "for_revision",
      approvedBy: null,
      approvedAt: null,
    })
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

/**
 * Records Accounting's review on one version. The snapshot itself is never
 * rewritten; only the review metadata on that version changes.
 */
export async function reviewPurchaseOrderRevision(
  tx: Tx,
  input: {
    purchaseOrderId: number;
    versionNo: number;
    reviewedBy: number;
    budgetOk: boolean;
    reviewReason: string | null;
    reviewedAt: Date;
  },
): Promise<boolean> {
  const rows = await tx
    .update(purchaseOrderRevisions)
    .set({
      reviewedBy: input.reviewedBy,
      budgetOk: input.budgetOk,
      reviewReason: input.reviewReason,
      reviewedAt: input.reviewedAt,
    })
    .where(
      and(
        eq(purchaseOrderRevisions.purchaseOrderId, input.purchaseOrderId),
        eq(purchaseOrderRevisions.versionNo, input.versionNo),
      ),
    )
    .returning({ revisionId: purchaseOrderRevisions.revisionId });

  return rows.length > 0;
}

/** Inserts a pending PO header and returns its new ID. */
export async function insertPurchaseOrder(
  tx: Tx,
  input: {
    supplierId: number;
    preparedBy: number;
    deliveryTerms: string | null;
  },
): Promise<number> {
  const [row] = await tx
    .insert(purchaseOrders)
    .values({
      ...input,
      status: "pending_approval",
      currentVersion: 1,
    })
    .returning({ purchaseOrderId: purchaseOrders.purchaseOrderId });

  return row.purchaseOrderId;
}

/** Inserts the lines of a PO draft. */
export async function insertPurchaseOrderLines(
  tx: Tx,
  purchaseOrderId: number,
  lines: readonly {
    purchaseRequisitionLineId: number;
    orderedQty: string;
    unitPrice: string;
  }[],
): Promise<{ purchaseOrderLineId: number; purchaseRequisitionLineId: number }[]> {
  if (lines.length === 0) {
    return [];
  }

  return tx
    .insert(purchaseOrderLines)
    .values(
      lines.map((line) => ({
        purchaseOrderId,
        purchaseRequisitionLineId: line.purchaseRequisitionLineId,
        orderedQty: line.orderedQty,
        unitPrice: line.unitPrice,
      })),
    )
    .returning({
      purchaseOrderLineId: purchaseOrderLines.purchaseOrderLineId,
      purchaseRequisitionLineId: purchaseOrderLines.purchaseRequisitionLineId,
    });
}

/** Stores one immutable PO version snapshot. */
export async function insertPurchaseOrderRevision(
  tx: Tx,
  input: {
    purchaseOrderId: number;
    versionNo: number;
    changedBy: number;
    snapshot: string;
  },
): Promise<number> {
  const [row] = await tx
    .insert(purchaseOrderRevisions)
    .values(input)
    .returning({ revisionId: purchaseOrderRevisions.revisionId });

  return row.revisionId;
}

/** Replaces the lines of an editable PO after the revision is validated. */
export async function deletePurchaseOrderLines(
  tx: Tx,
  purchaseOrderId: number,
): Promise<void> {
  await tx
    .delete(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
}

/** Stores a new PO version and sends it back to Accounting. */
export async function resetPurchaseOrderForReview(
  tx: Tx,
  purchaseOrderId: number,
  input: {
    supplierId: number;
    deliveryTerms: string | null;
    newVersion: number;
  },
): Promise<void> {
  await tx
    .update(purchaseOrders)
    .set({
      supplierId: input.supplierId,
      deliveryTerms: input.deliveryTerms,
      status: "pending_approval",
      currentVersion: input.newVersion,
      approvedBy: null,
      approvedAt: null,
    })
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

/**
 * Placement guard: the PO is approved and the approved revision is the current
 * version. Step 7 uses this before placing an order.
 */
export async function isPurchaseOrderCurrentVersionApproved(
  tx: Tx,
  purchaseOrderId: number,
): Promise<boolean> {
  const [row] = await tx
    .select({
      status: purchaseOrders.status,
      budgetOk: purchaseOrderRevisions.budgetOk,
      reviewedAt: purchaseOrderRevisions.reviewedAt,
    })
    .from(purchaseOrders)
    .leftJoin(
      purchaseOrderRevisions,
      and(
        eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrders.purchaseOrderId),
        eq(purchaseOrderRevisions.versionNo, purchaseOrders.currentVersion),
      ),
    )
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
    .limit(1);

  return Boolean(
    row && row.status === "approved" && row.budgetOk === true && row.reviewedAt !== null,
  );
}

/** Every line of one PO, in creation order. */
export async function findPurchaseOrderLines(
  tx: Tx,
  purchaseOrderId: number,
): Promise<PurchaseOrderLineDto[]> {
  const rows = await tx
    .select({
      purchaseOrderLineId: purchaseOrderLines.purchaseOrderLineId,
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      purchaseRequisitionId: purchaseRequisitionLines.purchaseRequisitionId,
      purchaseRequisitionLineId: purchaseOrderLines.purchaseRequisitionLineId,
      requisitionLineId: purchaseRequisitionLines.requisitionLineId,
      itemId: items.itemId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      orderedQty: purchaseOrderLines.orderedQty,
      unitPrice: purchaseOrderLines.unitPrice,
      cancelledQty: purchaseOrderLines.cancelledQty,
      acceptedQty: acceptedQtyForLine,
      outstandingQty: outstandingQtyForLine,
    })
    .from(purchaseOrderLines)
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .innerJoin(items, eq(items.itemId, purchaseRequisitionLines.itemId))
    .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(purchaseOrderLines.purchaseOrderLineId));

  return rows;
}

/** Lines for several POs in one query, so a list screen does not run one read per PO. */
export async function findPurchaseOrderLinesFor(
  tx: Tx,
  purchaseOrderIds: readonly number[],
): Promise<PurchaseOrderLineDto[]> {
  if (purchaseOrderIds.length === 0) {
    return [];
  }

  return tx
    .select({
      purchaseOrderLineId: purchaseOrderLines.purchaseOrderLineId,
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      purchaseRequisitionId: purchaseRequisitionLines.purchaseRequisitionId,
      purchaseRequisitionLineId: purchaseOrderLines.purchaseRequisitionLineId,
      requisitionLineId: purchaseRequisitionLines.requisitionLineId,
      itemId: items.itemId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      orderedQty: purchaseOrderLines.orderedQty,
      unitPrice: purchaseOrderLines.unitPrice,
      cancelledQty: purchaseOrderLines.cancelledQty,
      acceptedQty: acceptedQtyForLine,
      outstandingQty: outstandingQtyForLine,
    })
    .from(purchaseOrderLines)
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .innerJoin(items, eq(items.itemId, purchaseRequisitionLines.itemId))
    .where(inArray(purchaseOrderLines.purchaseOrderId, [...purchaseOrderIds]))
    .orderBy(asc(purchaseOrderLines.purchaseOrderLineId));
}

/** Every stored version of one PO, oldest first. */
export async function findPurchaseOrderRevisions(
  tx: Tx,
  purchaseOrderId: number,
): Promise<PurchaseOrderRevisionDto[]> {
  return tx
    .select({
      revisionId: purchaseOrderRevisions.revisionId,
      purchaseOrderId: purchaseOrderRevisions.purchaseOrderId,
      versionNo: purchaseOrderRevisions.versionNo,
      changedBy: purchaseOrderRevisions.changedBy,
      changedByName: users.fullName,
      reviewedBy: purchaseOrderRevisions.reviewedBy,
      reviewedByName: revisionReviewer.fullName,
      budgetOk: purchaseOrderRevisions.budgetOk,
      reviewReason: purchaseOrderRevisions.reviewReason,
      snapshot: purchaseOrderRevisions.snapshot,
      createdAt: purchaseOrderRevisions.createdAt,
      reviewedAt: purchaseOrderRevisions.reviewedAt,
    })
    .from(purchaseOrderRevisions)
    .innerJoin(users, eq(users.userId, purchaseOrderRevisions.changedBy))
    .leftJoin(revisionReviewer, eq(revisionReviewer.userId, purchaseOrderRevisions.reviewedBy))
    .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId))
    .orderBy(asc(purchaseOrderRevisions.versionNo));
}

/** One PO with its lines and revision history, or null when missing. */
export async function findPurchaseOrderById(
  tx: Tx,
  purchaseOrderId: number,
): Promise<PurchaseOrderDetailDto | null> {
  const [header] = await tx
    .select(purchaseOrderColumns)
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.supplierId, purchaseOrders.supplierId))
    .innerJoin(users, eq(users.userId, purchaseOrders.preparedBy))
    .leftJoin(approver, eq(approver.userId, purchaseOrders.approvedBy))
    .leftJoin(canceller, eq(canceller.userId, purchaseOrders.cancelledBy))
    .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId))
    .limit(1);

  if (!header) {
    return null;
  }

  const lines = await findPurchaseOrderLines(tx, purchaseOrderId);
  const revisions = await findPurchaseOrderRevisions(tx, purchaseOrderId);

  return { ...header, lines, revisions };
}

/** POs for a purchasing screen, newest first. Optionally filtered by status. */
export async function findPurchaseOrders(
  tx: Tx,
  options: {
    statuses?: readonly PurchaseOrderStatus[];
    limit: number;
  },
): Promise<PurchaseOrderDto[]> {
  const conditions =
    options.statuses && options.statuses.length > 0
      ? [inArray(purchaseOrders.status, [...options.statuses])]
      : [];

  const headers = await tx
    .select(purchaseOrderColumns)
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.supplierId, purchaseOrders.supplierId))
    .innerJoin(users, eq(users.userId, purchaseOrders.preparedBy))
    .leftJoin(approver, eq(approver.userId, purchaseOrders.approvedBy))
    .leftJoin(canceller, eq(canceller.userId, purchaseOrders.cancelledBy))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseOrders.purchaseOrderId))
    .limit(options.limit);

  if (headers.length === 0) {
    return [];
  }

  const lines = await findPurchaseOrderLinesFor(
    tx,
    headers.map((header) => header.purchaseOrderId),
  );
  const linesByPo = new Map<number, PurchaseOrderLineDto[]>();

  for (const line of lines) {
    const list = linesByPo.get(line.purchaseOrderId) ?? [];
    list.push(line);
    linesByPo.set(line.purchaseOrderId, list);
  }

  return headers.map((header) => ({
    ...header,
    lines: linesByPo.get(header.purchaseOrderId) ?? [],
  }));
}

/** Parses a stored snapshot when a caller needs its structured content. */
export function parsePurchaseOrderSnapshot(snapshot: string): PurchaseOrderSnapshot {
  return JSON.parse(snapshot) as PurchaseOrderSnapshot;
}
