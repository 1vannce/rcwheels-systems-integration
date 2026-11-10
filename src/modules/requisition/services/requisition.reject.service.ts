import "server-only";

import { AppUser, recordAudit, runBusinessEvent } from "@/modules/core";
import { RejectRequisitionDto } from "../schemas/requisition.dto";
import { lockForDecisionUtil as lockForDecision  } from "./utils/requisition.lock-for-decision.util";
import { 
    updateRequisitionStatus, 
    insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import { notifyUsers } from "@/modules/core";

/** Notification type recorded when an approver refuses a request. */
const REJECTED_NOTIFICATION = "requisition_rejected";

/**
 * Rejects a request with a reason. The requester is notified and may correct
 * and resubmit; the earlier decision stays in the history (BR-RQ-06).
 */
export async function rejectRequisitionService(
  actor: AppUser,
  dto: RejectRequisitionDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockForDecision(tx, actor, dto.requisitionId, "requisition.reject");

    await updateRequisitionStatus(tx, dto.requisitionId, "rejected");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "pending_approval",
      toStatus: "rejected",
      reason: dto.reason,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.reject",
      details: { reason: dto.reason },
    });

    await notifyUsers(tx, [locked.submittedBy], {
      type: REJECTED_NOTIFICATION,
      message: `Request #${dto.requisitionId} was rejected: ${dto.reason}`,
      requisitionId: dto.requisitionId,
    });
  });
}