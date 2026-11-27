import "server-only";

import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  items,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  requisitionLines,
  requisitions,
  supplierCommitments,
  supplierDiscrepancies,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
  users,
} from "@/db/schema";

import type { SupplierCommitment, SupplierDiscrepancy } from "../types/supplier-discrepancy.type";

// Drizzle queries for supplier discrepancy reports and connector D: no business
// rules, and every function takes the caller's transaction.

export async function insertSupplierDiscrepancy(
  tx: Tx,
  input: {
    purchaseOrderLineId: number;
    supplierReceiptLineId: number | null;
    reportedBy: number;
    problem: string;
    affectedQty: string;
  },
): Promise<number> {
  const [row] = await tx
    .insert(supplierDiscrepancies)
    .values(input)
    .returning({ supplierDiscrepancyId: supplierDiscrepancies.supplierDiscrepancyId });

  return row.supplierDiscrepancyId;
}

/** Which of these PO lines already have a report that is not resolved. */
export async function findLineIdsWithUnresolvedDiscrepancy(
  tx: Tx,
  purchaseOrderLineIds: readonly number[],
): Promise<number[]> {
  if (purchaseOrderLineIds.length === 0) {
    return [];
  }

  const rows = await tx
    .selectDistinct({ purchaseOrderLineId: supplierDiscrepancies.purchaseOrderLineId })
    .from(supplierDiscrepancies)
    .where(
      and(
        inArray(supplierDiscrepancies.purchaseOrderLineId, [...purchaseOrderLineIds]),
        ne(supplierDiscrepancies.status, "resolved"),
      ),
    );

  return rows.map((row) => row.purchaseOrderLineId);
}

/** The PO a report belongs to, read before the PO header lock is taken. */
export async function findDiscrepancyPurchaseOrderId(
  tx: Tx,
  supplierDiscrepancyId: number,
): Promise<number | null> {
  const [row] = await tx
    .select({ purchaseOrderId: purchaseOrderLines.purchaseOrderId })
    .from(supplierDiscrepancies)
    .innerJoin(
      purchaseOrderLines,
      eq(purchaseOrderLines.purchaseOrderLineId, supplierDiscrepancies.purchaseOrderLineId),
    )
    .where(eq(supplierDiscrepancies.supplierDiscrepancyId, supplierDiscrepancyId));

  return row?.purchaseOrderId ?? null;
}

export async function lockSupplierDiscrepancy(tx: Tx, supplierDiscrepancyId: number) {
  const [row] = await tx
    .select()
    .from(supplierDiscrepancies)
    .where(eq(supplierDiscrepancies.supplierDiscrepancyId, supplierDiscrepancyId))
    .for("update");

  return row ?? null;
}

export async function saveSupplierDiscrepancy(
  tx: Tx,
  supplierDiscrepancyId: number,
  values: Partial<
    Pick<
      typeof supplierDiscrepancies.$inferInsert,
      "problem" | "affectedQty" | "status" | "resolutionAction"
    >
  >,
): Promise<void> {
  await tx
    .update(supplierDiscrepancies)
    .set(values)
    .where(eq(supplierDiscrepancies.supplierDiscrepancyId, supplierDiscrepancyId));
}

export async function insertSupplierCommitment(
  tx: Tx,
  input: {
    supplierDiscrepancyId: number;
    agreedAction: SupplierCommitment["agreedAction"];
    committedQty: string;
    expectedDeliveryDate: Date;
  },
): Promise<void> {
  await tx.insert(supplierCommitments).values(input);
}

export async function findSupplierCommitment(tx: Tx, supplierDiscrepancyId: number) {
  const [row] = await tx
    .select()
    .from(supplierCommitments)
    .where(eq(supplierCommitments.supplierDiscrepancyId, supplierDiscrepancyId));

  return row ?? null;
}

export async function markSupplierCommitmentFulfilled(
  tx: Tx,
  supplierDiscrepancyId: number,
): Promise<void> {
  await tx
    .update(supplierCommitments)
    .set({ status: "fulfilled" })
    .where(eq(supplierCommitments.supplierDiscrepancyId, supplierDiscrepancyId));
}

/** Every replacement commitment on one PO line, oldest first. */
export async function findReplacementCommitments(tx: Tx, purchaseOrderLineId: number) {
  return tx
    .select({
      commitmentId: supplierCommitments.commitmentId,
      supplierDiscrepancyId: supplierCommitments.supplierDiscrepancyId,
      committedQty: supplierCommitments.committedQty,
      status: supplierDiscrepancies.status,
    })
    .from(supplierCommitments)
    .innerJoin(
      supplierDiscrepancies,
      eq(supplierDiscrepancies.supplierDiscrepancyId, supplierCommitments.supplierDiscrepancyId),
    )
    .where(
      and(
        eq(supplierDiscrepancies.purchaseOrderLineId, purchaseOrderLineId),
        eq(supplierCommitments.agreedAction, "replace"),
      ),
    )
    .orderBy(asc(supplierCommitments.recordedAt), asc(supplierCommitments.commitmentId));
}

/**
 * For each replacement commitment on a PO line, the receipt lines on that line
 * received after the commitment was recorded. The times are compared in the
 * database to keep their microseconds.
 */
export async function findReceiptLinesAfterCommitments(tx: Tx, purchaseOrderLineId: number) {
  return tx
    .select({
      commitmentId: supplierCommitments.commitmentId,
      supplierReceiptLineId: supplierReceiptLines.supplierReceiptLineId,
      acceptedQty: supplierReceiptLines.acceptedQty,
    })
    .from(supplierCommitments)
    .innerJoin(
      supplierDiscrepancies,
      eq(supplierDiscrepancies.supplierDiscrepancyId, supplierCommitments.supplierDiscrepancyId),
    )
    .innerJoin(
      supplierReceiptLines,
      eq(supplierReceiptLines.purchaseOrderLineId, supplierDiscrepancies.purchaseOrderLineId),
    )
    .innerJoin(
      supplierReceipts,
      and(
        eq(supplierReceipts.supplierReceiptId, supplierReceiptLines.supplierReceiptId),
        gt(supplierReceipts.receivedAt, supplierCommitments.recordedAt),
      ),
    )
    .where(
      and(
        eq(supplierDiscrepancies.purchaseOrderLineId, purchaseOrderLineId),
        eq(supplierCommitments.agreedAction, "replace"),
      ),
    )
    .orderBy(asc(supplierReceiptLines.supplierReceiptLineId));
}

/** Whether a receipt line belongs to the given PO line. */
export async function receiptLineIsOnPurchaseOrderLine(
  tx: Tx,
  supplierReceiptLineId: number,
  purchaseOrderLineId: number,
): Promise<boolean> {
  const rows = await tx
    .select({ id: supplierReceiptLines.supplierReceiptLineId })
    .from(supplierReceiptLines)
    .where(
      and(
        eq(supplierReceiptLines.supplierReceiptLineId, supplierReceiptLineId),
        eq(supplierReceiptLines.purchaseOrderLineId, purchaseOrderLineId),
      ),
    );

  return rows.length > 0;
}

/** Reports with their PO, item, and commitment, newest first. */
export async function findSupplierDiscrepancies(
  tx: Tx,
  filter: { supplierDiscrepancyId?: number },
  limit: number,
): Promise<SupplierDiscrepancy[]> {
  const rows = await tx
    .select({
      supplierDiscrepancyId: supplierDiscrepancies.supplierDiscrepancyId,
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      purchaseOrderLineId: supplierDiscrepancies.purchaseOrderLineId,
      supplierReceiptLineId: supplierDiscrepancies.supplierReceiptLineId,
      supplierName: suppliers.supplierName,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      affectedQty: supplierDiscrepancies.affectedQty,
      problem: supplierDiscrepancies.problem,
      status: supplierDiscrepancies.status,
      resolutionAction: supplierDiscrepancies.resolutionAction,
      reportedByName: users.fullName,
      reportedAt: supplierDiscrepancies.reportedAt,
      commitment: {
        agreedAction: supplierCommitments.agreedAction,
        committedQty: supplierCommitments.committedQty,
        expectedDeliveryDate: supplierCommitments.expectedDeliveryDate,
        status: supplierCommitments.status,
        recordedAt: supplierCommitments.recordedAt,
      },
    })
    .from(supplierDiscrepancies)
    .innerJoin(
      purchaseOrderLines,
      eq(purchaseOrderLines.purchaseOrderLineId, supplierDiscrepancies.purchaseOrderLineId),
    )
    .innerJoin(
      purchaseOrders,
      eq(purchaseOrders.purchaseOrderId, purchaseOrderLines.purchaseOrderId),
    )
    .innerJoin(suppliers, eq(suppliers.supplierId, purchaseOrders.supplierId))
    .innerJoin(
      purchaseRequisitionLines,
      eq(
        purchaseRequisitionLines.purchaseRequisitionLineId,
        purchaseOrderLines.purchaseRequisitionLineId,
      ),
    )
    .innerJoin(items, eq(items.itemId, purchaseRequisitionLines.itemId))
    .innerJoin(users, eq(users.userId, supplierDiscrepancies.reportedBy))
    .leftJoin(
      supplierCommitments,
      eq(supplierCommitments.supplierDiscrepancyId, supplierDiscrepancies.supplierDiscrepancyId),
    )
    .where(
      filter.supplierDiscrepancyId === undefined
        ? undefined
        : eq(supplierDiscrepancies.supplierDiscrepancyId, filter.supplierDiscrepancyId),
    )
    .orderBy(desc(supplierDiscrepancies.supplierDiscrepancyId))
    .limit(limit);

  // Drizzle returns null for the whole group when there is no commitment row.
  return rows.map((row) => ({ ...row, commitment: row.commitment as SupplierCommitment | null }));
}

/** Requests in Awaiting Stock with a line for one of these items (connector D). */
export async function findRequisitionsAwaitingItems(
  tx: Tx,
  itemIds: readonly number[],
): Promise<number[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const rows = await tx
    .selectDistinct({ requisitionId: requisitions.requisitionId })
    .from(requisitions)
    .innerJoin(requisitionLines, eq(requisitionLines.requisitionId, requisitions.requisitionId))
    .where(
      and(
        eq(requisitions.status, "awaiting_stock"),
        inArray(requisitionLines.itemId, [...itemIds]),
      ),
    )
    .orderBy(asc(requisitions.requisitionId));

  return rows.map((row) => row.requisitionId);
}
