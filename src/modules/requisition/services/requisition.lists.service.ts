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
  RequisitionListItemDto,
  RequisitionMechanicOptionDto,
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

  const ids = reqs.map((r) => r.requisitionId);
  const allLines = ids.length > 0 ? await findRequisitionLinesFor(db, ids) : [];

  const linesByRequisition = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByRequisition.get(line.requisitionId) ?? [];
    existing.push(line);
    linesByRequisition.set(line.requisitionId, existing);
  }

  return reqs.map((req) => ({
    ...req,
    lines: linesByRequisition.get(req.requisitionId) ?? [],
  }));
}

/** Requests waiting for the custodian's stock check and reservation. */
export async function listApprovedForIssueService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { statuses: ["approved", "awaiting_stock"] },
    REQUEST_LIST_LIMIT,
  );
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
