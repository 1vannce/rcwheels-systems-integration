import "server-only";

import { AppUser } from "@/modules/core";
import { lockRequisition } from "../../repositories/requisition.repository";
import { actionBlockedUtil as blocked } from "./requisition.action-blocker.util";
import type { LockedRequisition } from "../../repositories/requisition.repository";
import type { Tx } from "@/db";

/**
 * Locks the header and checks that the caller is the assigned approver and
 * that the request is still waiting for a decision. Approve and reject run
 * through here so the same guards protect every decision.
 */
export async function lockForDecisionUtil(
  tx: Tx,
  actor: AppUser,
  requisitionId: number,
  action: string,
): Promise<LockedRequisition> {
  const locked = await lockRequisition(tx, requisitionId);

  if (!locked) {
    throw blocked("The request no longer exists.", action, { requisitionId });
  }

  if (locked.status !== "pending_approval") {
    throw blocked("Only a pending request can be decided.", action, {
      requisitionId,
      status: locked.status,
    });
  }

  if (locked.approverId !== null && locked.approverId !== actor.userId) {
    throw blocked("Only the assigned approver can decide this request.", action, {
      requisitionId,
    });
  }

  return locked;
}