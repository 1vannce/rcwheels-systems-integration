import "server-only";

import { db } from "@/db";
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
  const requisitions = await findRequisitions(
    db,
    { approverId: user.userId, statuses: ["pending_approval"] },
    REQUEST_LIST_LIMIT,
  );

  const ids = requisitions.map((r) => r.requisitionId);
  const allLines = ids.length > 0 ? await findRequisitionLinesFor(db, ids) : [];

  const linesByRequisition = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const existing = linesByRequisition.get(line.requisitionId) ?? [];
    existing.push(line);
    linesByRequisition.set(line.requisitionId, existing);
  }

  return requisitions.map((req) => ({
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
