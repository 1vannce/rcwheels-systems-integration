import "server-only";

import { recordAudit, runBusinessEvent, type AppUser } from "@/modules/core";
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

/**
 * Submits a requisition for approval.
 *
 * One transaction writes the header, its lines, the first status-history
 * entry, the audit entry, and the approver's notification, so a request never
 * exists without its history or its alert (PLAN design rules).
 *
 * The signed-in user owns the record. `requesterName` only says who the items
 * are for (for example a mechanic), and defaults to the submitter's name.
 */
export async function submitRequisitionService(
  actor: AppUser,
  dto: CreateRequisitionDto,
): Promise<{ requisitionId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (dto.deliveryDate < todayInManila()) {
      throw await blocked("Delivery date cannot be in the past.", "requisition.submit", {
        deliveryDate: dto.deliveryDate,
      });
    }

    await assertItemsExist(tx, dto.lines);
    const requesterName = dto.requesterName || actor.fullName;

    const requisitionId = await insertRequisition(tx, {
      submittedBy: actor.userId,
      requesterName,
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
        requesterName,
        deliveryDate: dto.deliveryDate,
        deliveryLocation: dto.deliveryLocation,
      },
    });

    await notifyApprover(tx, actor, requisitionId, requesterName, dto.isUrgent);

    return { requisitionId };
  });
}
