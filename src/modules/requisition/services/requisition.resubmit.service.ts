import "server-only";

import {
  InvalidInputError,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { todayInManila } from "@/modules/inventory";
import {
  deleteRequisitionLines,
  insertRequisitionLines,
  lockRequisition,
  updateRequisitionHeader,
  updateRequisitionStatus,
  insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import { assertItemsExistUtil as assertItemsExist } from "./utils/requisition.assert-item-exists.util";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";
import type { ResubmitRequisitionDto } from "../schemas/requisition.dto";
import { notifyApproverUtil as notifyApprover } from "./utils/requisition.notify-approver.util";
import { resolveRequesterUtil } from "./utils/requisition.resolve-requester.util";

/**
 * Corrects a rejected request and sends it back through approval.
 *
 * The header and lines are updated and the status returns to Pending Approval,
 * while the earlier rejection stays in the append-only history (BR-RQ-06).
 */
export async function resubmitRequisitionService(
  actor: AppUser,
  dto: ResubmitRequisitionDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    if (dto.deliveryDate < todayInManila()) {
      throw new InvalidInputError("Delivery date cannot be in the past.");
    }

    const locked = await lockRequisition(tx, dto.requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.resubmit", dto);
    }

    if (locked.submittedBy !== actor.userId) {
      throw blocked("Only the submitter can correct this request.", "requisition.resubmit", dto);
    }

    if (locked.status !== "rejected") {
      throw blocked("Only a rejected request can be resubmitted.", "requisition.resubmit", {
        requisitionId: dto.requisitionId,
        status: locked.status,
      });
    }

    await assertItemsExist(tx, dto.lines);
    const requester = await resolveRequesterUtil(tx, actor, dto.requestedForUserId);

    await updateRequisitionHeader(tx, dto.requisitionId, {
      ...requester,
      isUrgent: dto.isUrgent,
      purpose: dto.purpose,
      deliveryDate: dto.deliveryDate,
      deliveryLocation: dto.deliveryLocation,
    });

    // Replace the corrected lines. A rejected request has never been approved,
    // so no reservation, dispatch, or purchase line refers to these rows; this
    // is correcting a draft, not rewriting history.
    await deleteRequisitionLines(tx, dto.requisitionId);
    await insertRequisitionLines(
      tx,
      dto.requisitionId,
      dto.lines.map((line) => ({ itemId: line.itemId, requestedQty: line.requestedQty })),
    );

    await updateRequisitionStatus(tx, dto.requisitionId, "pending_approval");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "rejected",
      toStatus: "pending_approval",
      reason: "Corrected and resubmitted",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.resubmit",
      details: {
        lineCount: dto.lines.length,
        isUrgent: dto.isUrgent,
        ...requester,
        deliveryDate: dto.deliveryDate,
        deliveryLocation: dto.deliveryLocation,
      },
    });

    await notifyApprover(tx, actor, dto.requisitionId, requester.requesterName, dto.isUrgent);
  });
}
