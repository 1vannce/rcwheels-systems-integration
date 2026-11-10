import "server-only";

import { db } from "@/db";
import { type AppUser } from "@/modules/core";
import { findRequisitions } from "../repositories/requisition.repository";
import type { RequisitionListItemDto } from "../types/requisition.dto";

/** How many rows a request list returns before it needs paging. */
const REQUEST_LIST_LIMIT = 100;

/**
 * The signed-in user's own requests, urgent first and then newest first.
 * Overview figures only; the detail screen loads the lines and history.
 */
export async function listMyRequestsService(user: AppUser): Promise<RequisitionListItemDto[]> {
  return findRequisitions(db, { submittedBy: user.userId }, REQUEST_LIST_LIMIT);
}

/**
 * The requests waiting for this approver's decision, urgent first and then
 * newest first.
 */
export async function listPendingApprovalsService(user: AppUser): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { approverId: user.userId, statuses: ["pending_approval"] },
    REQUEST_LIST_LIMIT,
  );
}

/** Requests waiting for the custodian's stock check and reservation. */
export async function listApprovedForIssueService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(
    db,
    { statuses: ["approved", "awaiting_stock"] },
    REQUEST_LIST_LIMIT,
  );
}
