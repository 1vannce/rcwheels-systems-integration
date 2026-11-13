import "server-only";

import { AppUser, recordAudit, runBusinessEvent } from "@/modules/core";
import { PrepareAcknowledgementReceiptDto } from "../schemas/requisition.dto";
import { AR_PREPARABLE_STATUSES, RequisitionListItemDto } from "../types/requisition.dto";
import { 
    lockRequisition, 
    findRequisitionLines, 
    updateRequisitionStatus, 
    insertRequisitionStatusHistory, 
    findPreparedDispatchByRequisition, 
    insertDispatch, 
    insertDispatchLines, 
    insertAcknowledgementReceipt,
    findRequisitionsReadyForAr
} from "../repositories/requisition.repository";
import { compareQuantities, formatQuantity } from "@/modules/inventory";
import { notifyRoles } from "@/modules/core";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";
import { db } from "@/db";

/** Defines How many rows a request list returns before it needs paging. */
const REQUEST_LIST_LIMIT = 100;

/**
 * Prepares the dispatch and acknowledgement receipt for a reserved request.
 *
 * One transaction writes the dispatch and its lines, the prepared AR, the
 * status change to For Delivery, the history, the audit entry, and the
 * delivery queue notification (connector C). Stock is not deducted here; the
 * dispatch posts it once when released (BR-IN-04).
 */
export async function prepareAcknowledgementReceiptService(
  actor: AppUser,
  dto: PrepareAcknowledgementReceiptDto,
): Promise<{ dispatchId: number; acknowledgementReceiptId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockRequisition(tx, dto.requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.prepare-ar", dto);
    }

    if (!(AR_PREPARABLE_STATUSES as readonly string[]).includes(locked.status)) {
      throw blocked(
        "Only a reserved request can be prepared for delivery.",
        "requisition.prepare-ar",
        { requisitionId: dto.requisitionId, status: locked.status },
      );
    }

    // One open AR at a time: the prepared issue must be dispatched before the
    // remainder of a partial issue can be prepared (issue #31).
    if (await findPreparedDispatchByRequisition(tx, dto.requisitionId)) {
      throw blocked(
        "An acknowledgement receipt is already waiting for dispatch on this request.",
        "requisition.prepare-ar",
        dto,
      );
    }

    const lines = await findRequisitionLines(tx, dto.requisitionId);
    const lineById = new Map(lines.map((line) => [line.requisitionLineId, line]));

    const dispatchLines = dto.lines.map((line) => {
      const existing = lineById.get(line.requisitionLineId);

      if (!existing) {
        throw blocked("A line does not belong to this request.", "requisition.prepare-ar", dto);
      }

      if (compareQuantities(line.sentQty, existing.reservedQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(existing.reservedQty)} is reserved for this line.`,
          "requisition.prepare-ar",
          dto,
        );
      }

      if (compareQuantities(line.sentQty, existing.unissuedQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(existing.unissuedQty)} still needs to be sent.`,
          "requisition.prepare-ar",
          dto,
        );
      }

      return { requisitionLineId: line.requisitionLineId, sentQty: line.sentQty };
    });

    const dispatchId = await insertDispatch(tx, {
      requisitionId: dto.requisitionId,
      dispatchedBy: actor.userId,
      deliveryPersonnel: dto.deliveryPersonnel,
      status: "prepared",
    });

    await insertDispatchLines(tx, dispatchId, dispatchLines);
    const acknowledgementReceiptId = await insertAcknowledgementReceipt(tx, {
      dispatchId,
      preparedBy: actor.userId,
    });

    await updateRequisitionStatus(tx, dto.requisitionId, "for_delivery");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: locked.status,
      toStatus: "for_delivery",
      reason: "Acknowledgement receipt prepared",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.prepare-ar",
      details: {
        dispatchId,
        acknowledgementReceiptId,
        deliveryPersonnel: dto.deliveryPersonnel,
        lines: dto.lines,
      },
    });

    await notifyRoles(tx, ["delivery_operations"], {
      type: "requisition_for_delivery",
      message: `Request #${dto.requisitionId} is ready for delivery; the acknowledgement receipt is prepared.`,
      requisitionId: dto.requisitionId,
    });

    return { dispatchId, acknowledgementReceiptId };
  });
}

/** Requests with reserved stock and no open AR: the AR preparation queue. */
export async function listReadyForArPreparationService(): Promise<RequisitionListItemDto[]> {
  return findRequisitionsReadyForAr(db, REQUEST_LIST_LIMIT);
}