import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";
import {
  acknowledgementReceipts,
  dispatches,
  dispatchLines,
  internalDiscrepancies,
  items,
  requisitionLines,
  requisitions,
  returnLines,
  returns,
  users,
} from "@/db/schema";

import type { InternalDiscrepancyStatus } from "../types/delivery.type";

// Drizzle queries for internal delivery only: no business rules, and every
// function takes the caller's transaction.

/** Who accepts a request's deliveries: the mechanic it was filed for, else the submitter. */
const recipientUserId = sql<number>`coalesce(${requisitions.requestedForUserId}, ${requisitions.submittedBy})`;

/** Quantity returned from one dispatch line. */
const lineReturnedQty = sql<string>`coalesce((
  select sum(${returnLines.returnedQty}) from ${returnLines}
  where ${returnLines.dispatchLineId} = ${dispatchLines.dispatchLineId}
), 0)::numeric(14, 3)`;

/** Quantity already returned against one RDR. */
const discrepancyReturnedQty = sql<string>`coalesce((
  select sum(${returnLines.returnedQty})
  from ${returnLines}
  inner join ${returns} on ${returns.returnId} = ${returnLines.returnId}
  where ${returns.internalDiscrepancyId} = ${internalDiscrepancies.internalDiscrepancyId}
), 0)::numeric(14, 3)`;

// Deliveries and acknowledgement receipts.

/**
 * Released dispatches whose AR is not signed yet, urgent first and then oldest
 * first. With a recipient, only that person's deliveries.
 */
export async function findPendingDeliveries(
  tx: Tx,
  filter: { recipientUserId?: number },
  limit: number,
) {
  const conditions: SQL[] = [
    eq(dispatches.status, "dispatched"),
    isNull(acknowledgementReceipts.signedAt),
  ];

  if (filter.recipientUserId !== undefined) {
    conditions.push(sql`${recipientUserId} = ${filter.recipientUserId}`);
  }

  return tx
    .select({
      dispatchId: dispatches.dispatchId,
      acknowledgementReceiptId: acknowledgementReceipts.acknowledgementReceiptId,
      requisitionId: requisitions.requisitionId,
      submittedAt: requisitions.submittedAt,
      isUrgent: requisitions.isUrgent,
      requesterName: requisitions.requesterName,
      recipientUserId,
      deliveryLocation: requisitions.deliveryLocation,
      deliveryPersonnel: dispatches.deliveryPersonnel,
      dispatchedAt: dispatches.dispatchedAt,
    })
    .from(dispatches)
    .innerJoin(
      acknowledgementReceipts,
      eq(acknowledgementReceipts.dispatchId, dispatches.dispatchId),
    )
    .innerJoin(requisitions, eq(requisitions.requisitionId, dispatches.requisitionId))
    .where(and(...conditions))
    .orderBy(desc(requisitions.isUrgent), asc(dispatches.dispatchedAt))
    .limit(limit);
}

/** The lines of several dispatches with their item and quantities. */
export async function findDeliveryLines(tx: Tx, dispatchIds: readonly number[]) {
  if (dispatchIds.length === 0) {
    return [];
  }

  return tx
    .select({
      dispatchId: dispatchLines.dispatchId,
      dispatchLineId: dispatchLines.dispatchLineId,
      requisitionLineId: dispatchLines.requisitionLineId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      sentQty: dispatchLines.sentQty,
      acceptedQty: dispatchLines.acceptedQty,
      returnedQty: lineReturnedQty,
    })
    .from(dispatchLines)
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, dispatchLines.requisitionLineId),
    )
    .innerJoin(items, eq(items.itemId, requisitionLines.itemId))
    .where(inArray(dispatchLines.dispatchId, [...dispatchIds]))
    .orderBy(asc(dispatchLines.dispatchLineId));
}

/**
 * Locks a dispatch's AR until the transaction ends, so two signings of the
 * same delivery cannot both pass the "not signed yet" check.
 */
export async function lockAcknowledgementReceipt(tx: Tx, dispatchId: number) {
  const [row] = await tx
    .select({
      acknowledgementReceiptId: acknowledgementReceipts.acknowledgementReceiptId,
      signedAt: acknowledgementReceipts.signedAt,
    })
    .from(acknowledgementReceipts)
    .where(eq(acknowledgementReceipts.dispatchId, dispatchId))
    .for("update");

  return row ?? null;
}

/** The dispatch header with the request it belongs to and who accepts it. */
export async function findDispatchContext(tx: Tx, dispatchId: number) {
  const [row] = await tx
    .select({
      dispatchId: dispatches.dispatchId,
      status: dispatches.status,
      requisitionId: dispatches.requisitionId,
      recipientUserId,
    })
    .from(dispatches)
    .innerJoin(requisitions, eq(requisitions.requisitionId, dispatches.requisitionId))
    .where(eq(dispatches.dispatchId, dispatchId));

  return row ?? null;
}

/** Records the signed-in requester's confirmation on the AR (decision 3). */
export async function signAcknowledgementReceipt(
  tx: Tx,
  acknowledgementReceiptId: number,
  signedBy: number,
): Promise<void> {
  await tx
    .update(acknowledgementReceipts)
    .set({ signedBy, signedAt: new Date() })
    .where(eq(acknowledgementReceipts.acknowledgementReceiptId, acknowledgementReceiptId));
}

// Requester Discrepancy Reports (RDRs).

export async function insertInternalDiscrepancy(
  tx: Tx,
  values: { dispatchLineId: number; reportedBy: number; affectedQty: string; problem: string },
): Promise<number> {
  const [row] = await tx
    .insert(internalDiscrepancies)
    .values(values)
    .returning({ internalDiscrepancyId: internalDiscrepancies.internalDiscrepancyId });

  return row.internalDiscrepancyId;
}

/** Filters the RDR list by the request's recipient, assigned approver, or status. */
export type DiscrepancyFilter = {
  recipientUserId?: number;
  approverId?: number;
  statuses?: readonly InternalDiscrepancyStatus[];
  /** Only RDRs with quantity not yet returned. */
  awaitingReturn?: boolean;
};

const submitter = alias(users, "submitter");
const reporter = alias(users, "reporter");

/** RDRs with their item, request, and returned quantity, open ones first. */
export async function findDiscrepancies(tx: Tx, filter: DiscrepancyFilter, limit: number) {
  const conditions: SQL[] = [];

  if (filter.recipientUserId !== undefined) {
    conditions.push(sql`${recipientUserId} = ${filter.recipientUserId}`);
  }

  if (filter.approverId !== undefined) {
    conditions.push(eq(submitter.approverId, filter.approverId));
  }

  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(internalDiscrepancies.status, [...filter.statuses]));
  }

  if (filter.awaitingReturn) {
    conditions.push(sql`${discrepancyReturnedQty} < ${internalDiscrepancies.affectedQty}`);
  }

  return tx
    .select({
      internalDiscrepancyId: internalDiscrepancies.internalDiscrepancyId,
      dispatchLineId: internalDiscrepancies.dispatchLineId,
      requisitionId: requisitions.requisitionId,
      submittedAt: requisitions.submittedAt,
      requesterName: requisitions.requesterName,
      approverId: submitter.approverId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      affectedQty: internalDiscrepancies.affectedQty,
      returnedQty: discrepancyReturnedQty,
      problem: internalDiscrepancies.problem,
      status: internalDiscrepancies.status,
      resolutionAction: internalDiscrepancies.resolutionAction,
      reportedByName: reporter.fullName,
      reportedAt: internalDiscrepancies.reportedAt,
    })
    .from(internalDiscrepancies)
    .innerJoin(
      dispatchLines,
      eq(dispatchLines.dispatchLineId, internalDiscrepancies.dispatchLineId),
    )
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, dispatchLines.requisitionLineId),
    )
    .innerJoin(items, eq(items.itemId, requisitionLines.itemId))
    .innerJoin(requisitions, eq(requisitions.requisitionId, requisitionLines.requisitionId))
    .innerJoin(submitter, eq(submitter.userId, requisitions.submittedBy))
    .innerJoin(reporter, eq(reporter.userId, internalDiscrepancies.reportedBy))
    .where(and(...conditions))
    .orderBy(
      sql`${internalDiscrepancies.status} = 'pending_resolution' desc`,
      desc(internalDiscrepancies.reportedAt),
    )
    .limit(limit);
}

/** Locks one RDR with the request line it belongs to. */
export async function lockDiscrepancy(tx: Tx, internalDiscrepancyId: number) {
  const [row] = await tx
    .select({
      internalDiscrepancyId: internalDiscrepancies.internalDiscrepancyId,
      dispatchLineId: internalDiscrepancies.dispatchLineId,
      affectedQty: internalDiscrepancies.affectedQty,
      status: internalDiscrepancies.status,
    })
    .from(internalDiscrepancies)
    .where(eq(internalDiscrepancies.internalDiscrepancyId, internalDiscrepancyId))
    .for("update");

  if (!row) {
    return null;
  }

  const [context] = await tx
    .select({
      requisitionId: requisitionLines.requisitionId,
      requisitionLineId: requisitionLines.requisitionLineId,
      recipientUserId,
      approverId: submitter.approverId,
    })
    .from(dispatchLines)
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, dispatchLines.requisitionLineId),
    )
    .innerJoin(requisitions, eq(requisitions.requisitionId, requisitionLines.requisitionId))
    .innerJoin(submitter, eq(submitter.userId, requisitions.submittedBy))
    .where(eq(dispatchLines.dispatchLineId, row.dispatchLineId));

  return { ...row, ...context };
}

export async function resolveDiscrepancy(
  tx: Tx,
  internalDiscrepancyId: number,
  values: { status: InternalDiscrepancyStatus; resolutionAction: string; resolvedBy: number },
): Promise<void> {
  await tx
    .update(internalDiscrepancies)
    .set(values)
    .where(eq(internalDiscrepancies.internalDiscrepancyId, internalDiscrepancyId));
}

/** Quantity already returned against one RDR. */
export async function sumReturnedForDiscrepancy(
  tx: Tx,
  internalDiscrepancyId: number,
): Promise<string> {
  const [row] = await tx
    .select({
      returnedQty: sql<string>`coalesce(sum(${returnLines.returnedQty}), 0)::numeric(14, 3)`,
    })
    .from(returnLines)
    .innerJoin(returns, eq(returns.returnId, returnLines.returnId))
    .where(eq(returns.internalDiscrepancyId, internalDiscrepancyId));

  return row?.returnedQty ?? "0.000";
}

// Returns.

export async function insertReturn(
  tx: Tx,
  values: { internalDiscrepancyId: number; receivedBy: number },
): Promise<number> {
  const [row] = await tx
    .insert(returns)
    .values({ ...values, status: "pending_inspection" })
    .returning({ returnId: returns.returnId });

  return row.returnId;
}

export async function insertReturnLine(
  tx: Tx,
  values: { returnId: number; dispatchLineId: number; returnedQty: string },
): Promise<number> {
  const [row] = await tx
    .insert(returnLines)
    .values({ ...values, condition: "hold" })
    .returning({ returnLineId: returnLines.returnLineId });

  return row.returnLineId;
}

/** Returned lines still in held stock, oldest first. */
export async function findReturnLinesInHold(tx: Tx, limit: number) {
  return tx
    .select({
      returnLineId: returnLines.returnLineId,
      returnId: returns.returnId,
      internalDiscrepancyId: returns.internalDiscrepancyId,
      requisitionId: requisitions.requisitionId,
      submittedAt: requisitions.submittedAt,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      returnedQty: returnLines.returnedQty,
      problem: internalDiscrepancies.problem,
      returnedAt: returns.returnedAt,
      receivedByName: users.fullName,
      inspectedAt: returnLines.inspectedAt,
    })
    .from(returnLines)
    .innerJoin(returns, eq(returns.returnId, returnLines.returnId))
    .innerJoin(
      internalDiscrepancies,
      eq(internalDiscrepancies.internalDiscrepancyId, returns.internalDiscrepancyId),
    )
    .innerJoin(users, eq(users.userId, returns.receivedBy))
    .innerJoin(dispatchLines, eq(dispatchLines.dispatchLineId, returnLines.dispatchLineId))
    .innerJoin(
      requisitionLines,
      eq(requisitionLines.requisitionLineId, dispatchLines.requisitionLineId),
    )
    .innerJoin(items, eq(items.itemId, requisitionLines.itemId))
    .innerJoin(requisitions, eq(requisitions.requisitionId, requisitionLines.requisitionId))
    .where(eq(returnLines.condition, "hold"))
    .orderBy(asc(returns.returnedAt))
    .limit(limit);
}

/** Locks one return line so two inspections cannot both post it. */
export async function lockReturnLine(tx: Tx, returnLineId: number) {
  const [row] = await tx
    .select({
      returnLineId: returnLines.returnLineId,
      returnId: returnLines.returnId,
      dispatchLineId: returnLines.dispatchLineId,
      returnedQty: returnLines.returnedQty,
      condition: returnLines.condition,
    })
    .from(returnLines)
    .where(eq(returnLines.returnLineId, returnLineId))
    .for("update");

  return row ?? null;
}

export async function updateReturnLineInspection(
  tx: Tx,
  returnLineId: number,
  condition: "usable" | "damaged" | "hold",
): Promise<void> {
  await tx
    .update(returnLines)
    .set({ condition, inspectedAt: new Date() })
    .where(eq(returnLines.returnLineId, returnLineId));
}

/** True when any line of the return is still held. */
export async function returnHasHeldLines(tx: Tx, returnId: number): Promise<boolean> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(returnLines)
    .where(and(eq(returnLines.returnId, returnId), eq(returnLines.condition, "hold")));

  return (row?.count ?? 0) > 0;
}

export async function updateReturnStatus(tx: Tx, returnId: number, status: string): Promise<void> {
  await tx.update(returns).set({ status }).where(eq(returns.returnId, returnId));
}
