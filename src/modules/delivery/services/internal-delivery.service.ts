import "server-only";

import { db, type Tx } from "@/db";
import {
  BlockedActionError,
  notifyRoles,
  notifyUsers,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import {
  acceptDispatchedItems,
  addQuantities,
  compareQuantities,
  formatQuantity,
  subtractQuantities,
} from "@/modules/inventory";
import { formatRfNumber, settleRequisitionAfterDelivery } from "@/modules/requisition";

import {
  countPendingDeliveryRows,
  findDeliveryLines,
  findDispatchContext,
  findPendingDeliveries,
  insertInternalDiscrepancy,
  lockAcknowledgementReceipt,
  signAcknowledgementReceipt,
} from "../repositories/delivery.repository";
import type { AcceptDeliveryInput } from "../schemas/delivery.schema";
import type { PendingDelivery } from "../types/delivery.type";

/** How many deliveries a queue shows before it needs paging. */
const QUEUE_LIMIT = 100;

function blocked(message: string, details: Record<string, unknown>): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "acknowledgement_receipts",
    entityId: 0,
    action: "delivery.accept",
    details,
  });
}

async function withLines(
  rows: Awaited<ReturnType<typeof findPendingDeliveries>>,
): Promise<PendingDelivery[]> {
  const lines = await findDeliveryLines(
    db,
    rows.map((row) => row.dispatchId),
  );

  return rows.map(({ submittedAt, ...row }) => ({
    ...row,
    rfNumber: formatRfNumber(row.requisitionId, submittedAt),
    lines: lines
      .filter((line) => line.dispatchId === row.dispatchId)
      .map((line) => ({
        dispatchLineId: line.dispatchLineId,
        requisitionLineId: line.requisitionLineId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        sentQty: line.sentQty,
        acceptedQty: line.acceptedQty,
        returnedQty: line.returnedQty,
      })),
  }));
}

/**
 * The Internal Delivery queue (connector C, BR-DL-03): every released dispatch
 * whose AR the requester has not signed yet.
 */
export async function listInternalDeliveryQueue(): Promise<PendingDelivery[]> {
  return withLines(await findPendingDeliveries(db, {}, QUEUE_LIMIT));
}

/** Unsigned deliveries, all of them or one recipient's, with no list limit. */
export async function countPendingDeliveries(
  filter: { recipientUserId?: number } = {},
): Promise<number> {
  return countPendingDeliveryRows(db, filter);
}

/**
 * Deliveries waiting for acceptance. A requester sees only the deliveries they
 * accept themselves; delivery staff and the administrator see all of them.
 */
export async function listDeliveriesToAccept(actor: AppUser): Promise<PendingDelivery[]> {
  const filter = actor.role === "requester" ? { recipientUserId: actor.userId } : {};

  return withLines(await findPendingDeliveries(db, filter, QUEUE_LIMIT));
}

/**
 * The requester inspects a delivery and signs its AR (BR-DL-04, BR-DL-05).
 *
 * Every line is accepted, rejected, or split, and the two must add up to what
 * is still in transit on the line. Accepted quantity posts the acceptance
 * event once and deducts no stock (BR-IN-04). Rejected quantity becomes an RDR
 * with the problem and the affected quantity, and the request moves to
 * Pending Resolution (BR-DL-07). The AR stores the signer and the time
 * (decision 3). Everything commits together.
 */
export async function acceptDelivery(
  actor: AppUser,
  input: AcceptDeliveryInput,
): Promise<{ acknowledgementReceiptId: number; discrepancyIds: number[] }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const receipt = await lockAcknowledgementReceipt(tx, input.dispatchId);

    if (!receipt) {
      throw blocked("This delivery has no acknowledgement receipt.", input);
    }

    if (receipt.signedAt) {
      throw blocked("This acknowledgement receipt is already signed.", input);
    }

    const dispatch = await findDispatchContext(tx, input.dispatchId);

    if (!dispatch || dispatch.status !== "dispatched") {
      throw blocked("These items have not been dispatched yet.", input);
    }

    if (dispatch.recipientUserId !== actor.userId) {
      throw blocked(
        "Only the person the items were requested for can sign this acknowledgement receipt.",
        input,
      );
    }

    const lines = await findDeliveryLines(tx, [input.dispatchId]);
    const decisions = new Map(input.lines.map((line) => [line.dispatchLineId, line]));

    if (decisions.size !== input.lines.length || decisions.size !== lines.length) {
      throw blocked("Accept or reject every line of the delivery once.", input);
    }

    const discrepancyIds: number[] = [];
    let acceptedLines = 0;

    for (const line of lines) {
      const decision = decisions.get(line.dispatchLineId);

      if (!decision) {
        throw blocked("Accept or reject every line of the delivery once.", input);
      }

      const inTransit = subtractQuantities(
        subtractQuantities(line.sentQty, line.acceptedQty),
        line.returnedQty,
      );
      const decided = addQuantities(decision.acceptedQty, decision.rejectedQty);

      if (compareQuantities(decided, inTransit) !== 0) {
        throw blocked(
          `${line.itemCode}: accepted and rejected quantities must add up to the ${formatQuantity(inTransit)} delivered.`,
          { ...input, dispatchLineId: line.dispatchLineId, inTransit },
        );
      }

      if (compareQuantities(decision.acceptedQty, "0") > 0) {
        await acceptDispatchedItems(tx, {
          dispatchLineId: line.dispatchLineId,
          quantity: decision.acceptedQty,
          sourceRef: `ar:${receipt.acknowledgementReceiptId}:line:${line.dispatchLineId}`,
        });
        acceptedLines += 1;
      }

      if (compareQuantities(decision.rejectedQty, "0") > 0) {
        discrepancyIds.push(
          await insertInternalDiscrepancy(tx, {
            dispatchLineId: line.dispatchLineId,
            reportedBy: actor.userId,
            affectedQty: decision.rejectedQty,
            problem: decision.problem,
          }),
        );
      }
    }

    await signAcknowledgementReceipt(tx, receipt.acknowledgementReceiptId, actor.userId);

    const request = await settleRequisitionAfterDelivery(tx, {
      requisitionId: dispatch.requisitionId,
      actorUserId: actor.userId,
      reason:
        discrepancyIds.length > 0
          ? "Items rejected on delivery; RDR issued"
          : "Acknowledgement receipt signed",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "acknowledgement_receipts",
      entityId: receipt.acknowledgementReceiptId,
      action: "delivery.accept",
      details: { dispatchId: input.dispatchId, lines: input.lines, discrepancyIds, acceptedLines },
    });

    await notifyAfterDeliveryEvent(tx, request, discrepancyIds.length);

    return { acknowledgementReceiptId: receipt.acknowledgementReceiptId, discrepancyIds };
  });
}

/** Tells the next person in the flow what the delivery event left them to do. */
export async function notifyAfterDeliveryEvent(
  tx: Tx,
  request: Awaited<ReturnType<typeof settleRequisitionAfterDelivery>>,
  newDiscrepancies: number,
): Promise<void> {
  const id = request.requisitionId;

  if (newDiscrepancies > 0) {
    if (request.approverId !== null) {
      await notifyUsers(tx, [request.approverId], {
        type: "delivery_rdr_issued",
        message: `Request #${id} has rejected items. Decide on a replacement or cancellation.`,
        requisitionId: id,
      });
    }

    await notifyRoles(tx, ["inventory_custodian", "delivery_operations"], {
      type: "delivery_return_expected",
      message: `Rejected items on request #${id} need to be returned to the stockroom.`,
      requisitionId: id,
    });
  }

  if (request.status === request.previousStatus) {
    return;
  }

  if (request.status === "delivered" && request.approverId !== null) {
    await notifyUsers(tx, [request.approverId], {
      type: "requisition_delivered",
      message: `Request #${id} is fully accepted or cancelled. Mark it Fulfilled.`,
      requisitionId: id,
    });
  }

  if (request.status === "approved") {
    // Connector F: the remaining or replacement need returns to Inventory.
    await notifyRoles(tx, ["inventory_custodian"], {
      type: "requisition_remaining_need",
      message: `Request #${id} has a remaining quantity to issue.`,
      requisitionId: id,
    });
  }
}
