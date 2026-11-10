import "server-only";

import { AppUser, recordAudit, runBusinessEvent } from "@/modules/core";
import { ApproveRequisitionDto } from "../schemas/requisition.dto";
import { lockForDecisionUtil as lockForDecision  } from "./utils/requisition.lock-for-decision.util";
import { 
    findRequisitionLines, 
    updateRequisitionLineApprovedQty,
    updateRequisitionStatus, 
    insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import { compareQuantities } from "@/modules/inventory";
import { notifyUsers, notifyRoles } from "@/modules/core";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";

/** Notification type recorded when a request enters the approval queue. */
const APPROVED_NOTIFICATION = "requisition.approved";

/**
 * Approves a request, possibly for less than the requested quantity.
 *
 * One transaction stores the per-line approved quantity, moves the header to
 * Approved, appends the history, notifies the requester, and alerts the
 * Inventory Custodian queue (connector A). Approving never authorizes a
 * purchase (BR-RQ-16).
 */
export async function approveRequisitionService(
  actor: AppUser,
  dto: ApproveRequisitionDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockForDecision(tx, actor, dto.requisitionId, "requisition.approve");

    // Checks if the approver attempts to approve their own request, 
    // which is not allowed.
    if (locked.submittedBy === actor.userId) {
      throw blocked("You cannot approve your own request.", "requisition.approve", dto);
    }

    const lines = await findRequisitionLines(tx, dto.requisitionId);
    const requestedByLine = new Map(
      lines.map((line) => [line.requisitionLineId, line.requestedQty]),
    );

    for (const line of dto.lines) {
      const requested = requestedByLine.get(line.requisitionLineId);

      if (requested === undefined) {
        throw blocked("One of the lines does not belong to this request.", "requisition.approve", dto);
      }

      if (compareQuantities(line.approvedQty, requested) > 0) {
        throw blocked(
          "The approved quantity cannot exceed what was requested.",
          "requisition.approve",
          dto,
        );
      }

      await updateRequisitionLineApprovedQty(tx, line.requisitionLineId, line.approvedQty);
    }

    await updateRequisitionStatus(tx, dto.requisitionId, "approved");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "pending_approval",
      toStatus: "approved",
      reason: null,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.approve",
      details: { approvedLines: dto.lines },
    });

    await notifyUsers(tx, [locked.submittedBy], {
      type: APPROVED_NOTIFICATION,
      message: `Request #${dto.requisitionId} was approved.`,
      requisitionId: dto.requisitionId,
    });

    await notifyRoles(
      tx,
      ["inventory_custodian"],
      {
        type: APPROVED_NOTIFICATION,
        message: `Request #${dto.requisitionId} is approved and ready for the stock check.`,
        requisitionId: dto.requisitionId,
      },
      actor.userId,
    );
  });
}