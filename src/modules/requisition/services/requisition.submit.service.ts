import "server-only";

import {
  InvalidInputError,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { todayInManila } from "@/modules/inventory";

import {
  insertRequisition,
  insertRequisitionLines,
  insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import type { CreateRequisitionDto } from "../schemas/requisition.dto";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";
import { assertItemsExistUtil as assertItemsExist } from "./utils/requisition.assert-item-exists.util";
import { notifyApproverUtil as notifyApprover } from "./utils/requisition.notify-approver.util";
import { resolveRequesterUtil } from "./utils/requisition.resolve-requester.util";

/**
 * Submits a requisition for approval.
 *
 * One transaction writes the header, its lines, the first status-history
 * entry, the audit entry, and the approver's notification, so a request never
 * exists without its history or its alert (PLAN design rules).
 *
 * The signed-in user remains the submitter. A selected mechanic is resolved
 * from an active account, and both identities are retained on the request.
 */
export async function submitRequisitionService(
  actor: AppUser,
  dto: CreateRequisitionDto,
): Promise<{ requisitionId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.approverId === null) {
      throw await blocked(
        "Your account has no assigned approver yet.",
        "requisition.submit",
        { requesterId: actor.userId },
      );
    }

    if (dto.deliveryDate < todayInManila()) {
      throw new InvalidInputError("Delivery date cannot be in the past.");
    }

    await assertItemsExist(tx, dto.lines);
    const requester = await resolveRequesterUtil(tx, actor, dto.requestedForUserId);

    const requisitionId = await insertRequisition(tx, {
      submittedBy: actor.userId,
      ...requester,
      isUrgent: dto.isUrgent,
      purpose: dto.purpose,
      deliveryDate: dto.deliveryDate,
      deliveryLocation: dto.deliveryLocation,
      status: "pending_approval",
    });

    await insertRequisitionLines(
      tx,
      requisitionId,
      dto.lines.map((line) => ({
        itemId: line.itemId,
        requestedQty: line.requestedQty,
      })),
    );

    await insertRequisitionStatusHistory(tx, {
      requisitionId,
      changedBy: actor.userId,
      fromStatus: null,
      toStatus: "pending_approval",
      reason: "Submitted for approval",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: requisitionId,
      action: "requisition.submit",
      details: {
        lineCount: dto.lines.length,
        isUrgent: dto.isUrgent,
        ...requester,
        deliveryDate: dto.deliveryDate,
        deliveryLocation: dto.deliveryLocation,
      },
    });

    await notifyApprover(tx, actor, requisitionId, requester.requesterName, dto.isUrgent);

    return { requisitionId };
  });
}
