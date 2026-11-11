import "server-only";

import { AppUser, notifyRoles, notifyUsers } from "@/modules/core";
import { Tx } from "@/db";

/** Notification type recorded when a request enters the approval queue. */
const SUBMITTED_NOTIFICATION = "requisition_submitted";

/**
 * Alerts the submitter's assigned approver. When no approver is assigned, it
 * falls back to every requisition approver so the request is still seen.
 */
export async function notifyApproverUtil(
  tx: Tx,
  actor: AppUser,
  requisitionId: number,
  requesterName: string,
  isUrgent: boolean,
): Promise<void> {
  const content = {
    type: SUBMITTED_NOTIFICATION,
    message: `${isUrgent ? "Urgent request" : "New request"} #${requisitionId} from ${requesterName} is waiting for approval.`,
    requisitionId,
  };

  if (actor.approverId === null) {
    await notifyRoles(tx, ["requisition_approver"], content);
    return;
  }

  await notifyUsers(tx, [actor.approverId], content);
}
