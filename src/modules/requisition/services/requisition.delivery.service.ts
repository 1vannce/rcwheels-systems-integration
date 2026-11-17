import "server-only";

import type { Tx } from "@/db";
import { notifyUsers, recordAudit, runBusinessEvent, type AppUser } from "@/modules/core";
import {
  addQuantities,
  compareQuantities,
  formatQuantity,
  subtractQuantities,
} from "@/modules/inventory";

import {
  addCancelledQty,
  countOpenDiscrepancies,
  findPreparedDispatchByRequisition,
  findRequisitionLines,
  insertRequisitionStatusHistory,
  lockRequisition,
  updateRequisitionStatus,
} from "../repositories/requisition.repository";
import type { MarkRequisitionFulfilledDto } from "../schemas/requisition.dto";
import type { RequisitionLineDto, RequisitionStatus } from "../types/requisition.dto";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";

// Requisition follow-up for internal delivery (Phase 4). The delivery module
// records acceptances, RDRs, and returns, then calls these functions inside its
// own transaction so the request status moves with the delivery record.

/** Statuses that delivery events never change. */
const SETTLED_STATUSES: readonly RequisitionStatus[] = [
  "pending_approval",
  "rejected",
  "fulfilled",
  "cancelled",
];

function inTransitOf(line: RequisitionLineDto): string {
  return subtractQuantities(
    subtractQuantities(line.dispatchedQty, line.acceptedQty),
    line.returnedQty,
  );
}

/** The request people involved in a delivery event, for notifications. */
export type DeliveryRequisitionParties = {
  requisitionId: number;
  status: RequisitionStatus;
  previousStatus: RequisitionStatus;
  submittedBy: number;
  /** Who accepts and signs ARs: the mechanic it was filed for, else the submitter. */
  recipientUserId: number;
  approverId: number | null;
};

/**
 * Reads the request's line quantities after a delivery event and moves the
 * header status to match (the status only summarizes the lines, BR-RQ-08):
 *
 * 1. an open RDR keeps it Pending Resolution (BR-RQ-14);
 * 2. a prepared AR keeps it For Delivery;
 * 3. anything still in transit keeps it Out for Delivery;
 * 4. any quantity still to be issued returns it to the Inventory queue as
 *    Approved (connector F, BR-DL-11);
 * 5. otherwise every approved quantity is accepted or cancelled, and it waits
 *    as Delivered for the approver to mark it Fulfilled (decision 5).
 */
export async function settleRequisitionAfterDelivery(
  tx: Tx,
  input: { requisitionId: number; actorUserId: number; reason: string },
): Promise<DeliveryRequisitionParties> {
  const locked = await lockRequisition(tx, input.requisitionId);

  if (!locked) {
    throw blocked("The request no longer exists.", "requisition.settle-delivery", input);
  }

  const parties = {
    requisitionId: locked.requisitionId,
    previousStatus: locked.status,
    submittedBy: locked.submittedBy,
    recipientUserId: locked.requestedForUserId ?? locked.submittedBy,
    approverId: locked.approverId,
  };

  if (SETTLED_STATUSES.includes(locked.status)) {
    return { ...parties, status: locked.status };
  }

  const lines = await findRequisitionLines(tx, input.requisitionId);
  let status: RequisitionStatus;

  if ((await countOpenDiscrepancies(tx, input.requisitionId)) > 0) {
    status = "pending_resolution";
  } else if (await findPreparedDispatchByRequisition(tx, input.requisitionId)) {
    status = "for_delivery";
  } else if (lines.some((line) => compareQuantities(inTransitOf(line), "0") > 0)) {
    status = "out_for_delivery";
  } else if (lines.some((line) => compareQuantities(line.unissuedQty, "0") > 0)) {
    status =
      locked.status === "approved" || locked.status === "awaiting_stock"
        ? locked.status
        : "approved";
  } else {
    status = "delivered";
  }

  if (status !== locked.status) {
    await updateRequisitionStatus(tx, input.requisitionId, status);
    await insertRequisitionStatusHistory(tx, {
      requisitionId: input.requisitionId,
      changedBy: input.actorUserId,
      fromStatus: locked.status,
      toStatus: status,
      reason: input.reason,
    });
  }

  return { ...parties, status };
}

/**
 * Cancels part of one line's balance, for example the quantity on an RDR the
 * approver decided not to replace. The cancelled total can never exceed what
 * was approved and not accepted, so accepted items stay accepted.
 */
export async function cancelRequisitionLineBalance(
  tx: Tx,
  input: { requisitionId: number; requisitionLineId: number; quantity: string },
): Promise<void> {
  const lines = await findRequisitionLines(tx, input.requisitionId);
  const line = lines.find((row) => row.requisitionLineId === input.requisitionLineId);

  if (!line) {
    throw blocked("The line does not belong to this request.", "requisition.cancel-balance", input);
  }

  const open = subtractQuantities(
    subtractQuantities(line.approvedQty, line.cancelledQty),
    line.acceptedQty,
  );

  if (compareQuantities(input.quantity, open) > 0) {
    throw blocked(
      `Only ${formatQuantity(open)} of this line can still be cancelled.`,
      "requisition.cancel-balance",
      { ...input, open },
    );
  }

  await addCancelledQty(tx, input.requisitionLineId, input.quantity);
}

/**
 * The assigned approver marks a Delivered request Fulfilled (decision 5). It
 * is refused unless every approved quantity is accepted or separately
 * cancelled (BR-RQ-11, BR-DL-12).
 */
export async function markRequisitionFulfilledService(
  actor: AppUser,
  dto: MarkRequisitionFulfilledDto,
): Promise<{ requisitionId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockRequisition(tx, dto.requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.fulfil", dto);
    }

    if (locked.approverId !== actor.userId) {
      throw blocked(
        "Only the request's assigned approver can mark it Fulfilled.",
        "requisition.fulfil",
        dto,
      );
    }

    if (locked.status !== "delivered") {
      throw blocked(
        "Only a request whose items are all accepted or cancelled can be marked Fulfilled.",
        "requisition.fulfil",
        { requisitionId: dto.requisitionId, status: locked.status },
      );
    }

    const lines = await findRequisitionLines(tx, dto.requisitionId);
    const unsettled = lines.filter(
      (line) =>
        compareQuantities(addQuantities(line.acceptedQty, line.cancelledQty), line.approvedQty) <
        0,
    );

    if (unsettled.length > 0) {
      throw blocked(
        "Some approved quantity is not yet accepted or cancelled.",
        "requisition.fulfil",
        dto,
      );
    }

    await updateRequisitionStatus(tx, dto.requisitionId, "fulfilled");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "delivered",
      toStatus: "fulfilled",
      reason: "All items accepted or cancelled",
    });
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.fulfil",
      details: {},
    });
    await notifyUsers(tx, [locked.submittedBy, locked.requestedForUserId ?? locked.submittedBy], {
      type: "requisition_fulfilled",
      message: `Request #${dto.requisitionId} is Fulfilled.`,
      requisitionId: dto.requisitionId,
    });

    return { requisitionId: dto.requisitionId };
  });
}
