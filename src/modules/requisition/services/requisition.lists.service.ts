import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { requisitions } from "@/db/schema";
import { type AppUser } from "@/modules/core";
import {
  findActiveMechanics,
  findRequisitionLinesFor,
  findRequisitions,
} from "../repositories/requisition.repository";
import type {
  PendingApprovalItemDto,
  RequisitionLineDto,
  RequisitionListItemDto,
  RequisitionMechanicOptionDto,
  RequisitionQueueItemDto,
} from "../types/requisition.dto";

/** How many rows a request list returns before it needs paging. */
const REQUEST_LIST_LIMIT = 100;

/**
 * Requests submitted by the signed-in user or filed for their mechanic
 * account, urgent first and then newest first.
 */
export async function listMyRequestsService(user: AppUser): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { submitterOrRequesterUserId: user.userId },
    REQUEST_LIST_LIMIT,
  );
}

/** Active mechanic accounts the requester may select for an RF. */
export async function listActiveMechanicsService(): Promise<RequisitionMechanicOptionDto[]> {
  return findActiveMechanics(db);
}

/** Attaches line items to a list of requisition headers. */
export async function attachLinesToRequisitions(
  reqs: RequisitionListItemDto[],
): Promise<RequisitionQueueItemDto[]> {
  if (reqs.length === 0) {
    return [];
  }
  const allLines = await findRequisitionLinesFor(
    db,
    reqs.map((r) => r.requisitionId),
  );
  const linesByReq = new Map<number, RequisitionLineDto[]>();
  for (const line of allLines) {
    const list = linesByReq.get(line.requisitionId) ?? [];
    list.push(line);
    linesByReq.set(line.requisitionId, list);
  }
  return reqs.map((r) => ({
    ...r,
    lines: linesByReq.get(r.requisitionId) ?? [],
  }));
}

/**
 * The requests waiting for this approver's decision, urgent first and then
 * newest first, including lines and stock availability for decision review.
 */
export async function listPendingApprovalsService(
  user: AppUser,
): Promise<PendingApprovalItemDto[]> {
  const reqs = await findRequisitions(
    db,
    { approverId: user.userId, statuses: ["pending_approval"] },
    REQUEST_LIST_LIMIT,
  );

  return attachLinesToRequisitions(reqs);
}

/** Requests waiting for the custodian's stock check and reservation. */
export async function listApprovedForIssueService(): Promise<RequisitionQueueItemDto[]> {
  const reqs = await findRequisitions(
    db,
    { statuses: ["approved", "awaiting_stock"] },
    REQUEST_LIST_LIMIT,
  );

  return attachLinesToRequisitions(reqs);
}

/** All digital requisition forms across the system, newest first. */
export async function listAllRequisitionsService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(db, {}, REQUEST_LIST_LIMIT);
}

/** Historical completed requisitions (fulfilled, rejected, cancelled). */
export async function listCompletedRequisitionsService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { statuses: ["fulfilled", "rejected", "cancelled"] },
    REQUEST_LIST_LIMIT,
  );
}

/** Requisitions that were rejected or have discrepancies needing review. */
export async function listRejectedRequisitionsService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { statuses: ["rejected", "pending_resolution"] },
    REQUEST_LIST_LIMIT,
  );
}

/** Predicts the automated RF number for the next requisition. */
export async function getNextRequisitionNumberService(): Promise<string> {
  const [row] = await db
    .select({ maxId: sql<number>`coalesce(max(${requisitions.requisitionId}), 0)` })
    .from(requisitions);
  const nextId = Number(row?.maxId ?? 0) + 1;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(nextId).padStart(3, "0");
  return `RF-${year}${month}-${seq}`;
}
