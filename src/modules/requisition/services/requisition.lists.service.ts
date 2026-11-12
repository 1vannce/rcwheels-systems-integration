import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { requisitions } from "@/db/schema";
import { type AppUser } from "@/modules/core";
import { findActiveMechanics, findRequisitions } from "../repositories/requisition.repository";
import type {
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
