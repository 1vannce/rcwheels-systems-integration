import "server-only";

import { AppUser, recordAudit, runBusinessEvent } from "@/modules/core";
import { DispatchRequisitionDto } from "../schemas/requisition.dto";
import { RequisitionListItemDto } from "../types/requisition.dto";
import { 
    lockRequisition, 
    findDispatchByRequisition, 
    findDispatchLines, 
    updateDispatchStatus, 
    updateRequisitionStatus, 
    insertRequisitionStatusHistory, 
    findActiveReservationForLine, 
    findRequisitions 
} from "../repositories/requisition.repository";
import { dispatchStockLines } from "@/modules/inventory";
import { compareQuantities, formatQuantity } from "@/modules/inventory";
import { notifyUsers } from "@/modules/core";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";
import { db } from "@/db";

/** Defines How many rows a request list returns before it needs paging. */
const REQUEST_LIST_LIMIT = 100;


/**
 * Releases a prepared dispatch: posts every line's sent quantity once, moves
 * the dispatch to dispatched and the request to Out for Delivery, and records
 * the history and audit entry. Stock is deducted here and only here
 * (BR-IN-04).
 */
export async function dispatchRequisitionService(
  actor: AppUser,
  dto: DispatchRequisitionDto,
): Promise<{ dispatchId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockRequisition(tx, dto.requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.dispatch", dto);
    }

    if (locked.status !== "for_delivery") {
      throw blocked(
        "Only a request that is For Delivery can be dispatched.",
        "requisition.dispatch",
        { requisitionId: dto.requisitionId, status: locked.status },
      );
    }

    const dispatch = await findDispatchByRequisition(tx, dto.requisitionId, "prepared");

    if (!dispatch) {
      throw blocked(
        "This request has no prepared acknowledgement receipt.",
        "requisition.dispatch",
        dto,
      );
    }

    const lines = await findDispatchLines(tx, dispatch.dispatchId);

    if (lines.length === 0) {
      throw blocked("The dispatch has no lines.", "requisition.dispatch", dto);
    }

    const inputs: { dispatchLineId: number; reservationId: number }[] = [];

    for (const line of lines) {
      const reservation = await findActiveReservationForLine(tx, line.requisitionLineId);

      if (!reservation) {
        throw blocked("A dispatch line has no active reservation.", "requisition.dispatch", dto);
      }

      if (compareQuantities(line.sentQty, reservation.reservedQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(reservation.reservedQty)} is reserved for dispatch on this line.`,
          "requisition.dispatch",
          dto,
        );
      }

      inputs.push({
        dispatchLineId: line.dispatchLineId,
        reservationId: reservation.reservationId,
      });
    }

    await dispatchStockLines(tx, inputs);

    await updateDispatchStatus(tx, dispatch.dispatchId, "dispatched");
    await updateRequisitionStatus(tx, dto.requisitionId, "out_for_delivery");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "for_delivery",
      toStatus: "out_for_delivery",
      reason: "Dispatched",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.dispatch",
      details: { dispatchId: dispatch.dispatchId, lines: lines.length },
    });

    await notifyUsers(tx, [locked.submittedBy], {
      type: "requisition_out_for_delivery",
      message: `Request #${dto.requisitionId} is out for delivery.`,
      requisitionId: dto.requisitionId,
    });

    return { dispatchId: dispatch.dispatchId };
  });
}

/** Requests whose prepared dispatch is waiting to be released. */
export async function listReadyForDispatchService(): Promise<RequisitionListItemDto[]> {
  return findRequisitions(db, { statuses: ["for_delivery"] }, REQUEST_LIST_LIMIT);
}