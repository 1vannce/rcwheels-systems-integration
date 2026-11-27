import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import type { Tx } from "@/db";
import {
  acknowledgementReceipts,
  auditLog,
  dispatches,
  dispatchLines,
  internalDiscrepancies,
  purchaseOrderLines,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  requisitions,
  requisitionStatusHistory,
  returnLines,
  returns,
  supplierDiscrepancies,
  supplierReceipts,
  users,
} from "@/db/schema";

// Read-only queries for the requisition timeline. Core sits below the other
// modules and cannot import them, so these read the shared tables directly.

export function findTimelineStatusHistory(tx: Tx, requisitionId: number) {
  return tx
    .select({
      historyId: requisitionStatusHistory.historyId,
      fromStatus: requisitionStatusHistory.fromStatus,
      toStatus: requisitionStatusHistory.toStatus,
      reason: requisitionStatusHistory.reason,
      changedAt: requisitionStatusHistory.changedAt,
      actorName: users.fullName,
    })
    .from(requisitionStatusHistory)
    .innerJoin(users, eq(users.userId, requisitionStatusHistory.changedBy))
    .where(eq(requisitionStatusHistory.requisitionId, requisitionId))
    .orderBy(asc(requisitionStatusHistory.historyId));
}

/** One row per AR of the request, with who is expected to sign it. */
export function findTimelineReceipts(tx: Tx, requisitionId: number) {
  return tx
    .select({
      acknowledgementReceiptId: acknowledgementReceipts.acknowledgementReceiptId,
      dispatchId: dispatches.dispatchId,
      dispatchStatus: dispatches.status,
      signedAt: acknowledgementReceipts.signedAt,
      submittedBy: requisitions.submittedBy,
      requestedForUserId: requisitions.requestedForUserId,
    })
    .from(acknowledgementReceipts)
    .innerJoin(dispatches, eq(dispatches.dispatchId, acknowledgementReceipts.dispatchId))
    .innerJoin(requisitions, eq(requisitions.requisitionId, dispatches.requisitionId))
    .where(eq(dispatches.requisitionId, requisitionId));
}

/** RDRs of the request, one row per return line (nulls until items come back). */
export function findTimelineDiscrepancies(tx: Tx, requisitionId: number) {
  return tx
    .select({
      internalDiscrepancyId: internalDiscrepancies.internalDiscrepancyId,
      returnId: returns.returnId,
      returnLineId: returnLines.returnLineId,
    })
    .from(internalDiscrepancies)
    .innerJoin(
      dispatchLines,
      eq(dispatchLines.dispatchLineId, internalDiscrepancies.dispatchLineId),
    )
    .innerJoin(dispatches, eq(dispatches.dispatchId, dispatchLines.dispatchId))
    .leftJoin(
      returns,
      eq(returns.internalDiscrepancyId, internalDiscrepancies.internalDiscrepancyId),
    )
    .leftJoin(returnLines, eq(returnLines.returnId, returns.returnId))
    .where(eq(dispatches.requisitionId, requisitionId));
}

/** PRs raised for the request's lines. */
export function findTimelinePurchaseRequisitions(tx: Tx, requisitionId: number) {
  return tx
    .selectDistinct({
      purchaseRequisitionId: purchaseRequisitions.purchaseRequisitionId,
      status: purchaseRequisitions.status,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, purchaseRequisitionLines.requisitionLineId),
    )
    .innerJoin(
      purchaseRequisitions,
      eq(
        purchaseRequisitions.purchaseRequisitionId,
        purchaseRequisitionLines.purchaseRequisitionId,
      ),
    )
    .where(eq(requisitionLines.requisitionId, requisitionId));
}

/** PO lines that order those PR lines. */
export function findTimelinePurchaseOrderLines(tx: Tx, requisitionId: number) {
  return tx
    .select({
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
      purchaseOrderLineId: purchaseOrderLines.purchaseOrderLineId,
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
      requisitionLines,
      eq(requisitionLines.requisitionLineId, purchaseRequisitionLines.requisitionLineId),
    )
    .where(eq(requisitionLines.requisitionId, requisitionId));
}

export async function findTimelineSupplierReceipts(tx: Tx, purchaseOrderIds: number[]) {
  if (purchaseOrderIds.length === 0) {
    return [];
  }

  return tx
    .select({
      supplierReceiptId: supplierReceipts.supplierReceiptId,
      purchaseOrderId: supplierReceipts.purchaseOrderId,
      deliveryReceiptNo: supplierReceipts.deliveryReceiptNo,
    })
    .from(supplierReceipts)
    .where(inArray(supplierReceipts.purchaseOrderId, purchaseOrderIds));
}

export async function findTimelineSupplierDiscrepancies(
  tx: Tx,
  purchaseOrderLineIds: number[],
) {
  if (purchaseOrderLineIds.length === 0) {
    return [];
  }

  return tx
    .select({
      supplierDiscrepancyId: supplierDiscrepancies.supplierDiscrepancyId,
      purchaseOrderId: purchaseOrderLines.purchaseOrderId,
    })
    .from(supplierDiscrepancies)
    .innerJoin(
      purchaseOrderLines,
      eq(purchaseOrderLines.purchaseOrderLineId, supplierDiscrepancies.purchaseOrderLineId),
    )
    .where(inArray(supplierDiscrepancies.purchaseOrderLineId, purchaseOrderLineIds));
}

const auditColumns = {
  auditId: auditLog.auditId,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  action: auditLog.action,
  changeDetails: auditLog.changeDetails,
  occurredAt: auditLog.occurredAt,
  actorName: users.fullName,
};

/** Audit entries of the given records. Each target names one table and its IDs. */
export async function findTimelineAuditEntries(
  tx: Tx,
  targets: { entityType: string; entityIds: number[] }[],
) {
  const filters = targets
    .filter((target) => target.entityIds.length > 0)
    .map((target) =>
      and(
        eq(auditLog.entityType, target.entityType),
        inArray(auditLog.entityId, target.entityIds),
      ),
    );

  if (filters.length === 0) {
    return [];
  }

  return tx
    .select(auditColumns)
    .from(auditLog)
    .leftJoin(users, eq(users.userId, auditLog.actorUserId))
    .where(or(...filters));
}

/**
 * Supplier receipts that flagged the request through connector D. The PO may be
 * unrelated to this request, so these are found by the flag in the audit
 * details, not by record ID. The CASE keeps the JSON cast to receipt entries.
 */
export function findTimelineStockArrivals(tx: Tx, requisitionId: number) {
  return tx
    .select({
      ...auditColumns,
      purchaseOrderId: supplierReceipts.purchaseOrderId,
      deliveryReceiptNo: supplierReceipts.deliveryReceiptNo,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.userId, auditLog.actorUserId))
    .innerJoin(supplierReceipts, eq(supplierReceipts.supplierReceiptId, auditLog.entityId))
    .where(
      sql`case when ${auditLog.entityType} = 'supplier_receipts' and ${auditLog.action} = 'supplier_receipt.receive'
        then coalesce(${auditLog.changeDetails}::jsonb -> 'flaggedRequisitionIds' @> to_jsonb(${requisitionId}::int), false)
        else false end`,
    );
}
