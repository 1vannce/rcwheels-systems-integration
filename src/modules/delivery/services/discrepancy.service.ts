import "server-only";

import { db } from "@/db";
import {
  BlockedActionError,
  notifyRoles,
  notifyUsers,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import {
  cancelRequisitionLineBalance,
  formatRfNumber,
  settleRequisitionAfterDelivery,
} from "@/modules/requisition";

import {
  findDiscrepancies,
  lockDiscrepancy,
  resolveDiscrepancy as saveResolution,
  type DiscrepancyFilter,
} from "../repositories/delivery.repository";
import type { ResolveDiscrepancyInput } from "../schemas/delivery.schema";
import type { InternalDiscrepancy } from "../types/delivery.type";
import { notifyAfterDeliveryEvent } from "./internal-delivery.service";

const LIST_LIMIT = 100;

function blocked(message: string, details: Record<string, unknown>): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "internal_discrepancies",
    entityId: 0,
    action: "delivery.resolve-rdr",
    details,
  });
}

export async function toDiscrepancies(
  rows: Awaited<ReturnType<typeof findDiscrepancies>>,
): Promise<InternalDiscrepancy[]> {
  return rows.map(({ submittedAt, ...row }) => ({
    ...row,
    rfNumber: formatRfNumber(row.requisitionId, submittedAt),
  }));
}

/**
 * RDRs the signed-in user is involved in: a requester sees the ones on their
 * own deliveries, an approver the ones on requests they approve, and stock and
 * delivery staff see every RDR.
 */
export async function listDiscrepancies(actor: AppUser): Promise<InternalDiscrepancy[]> {
  const filter: DiscrepancyFilter =
    actor.role === "requester"
      ? { recipientUserId: actor.userId }
      : actor.role === "requisition_approver"
        ? { approverId: actor.userId }
        : {};

  return toDiscrepancies(await findDiscrepancies(db, filter, LIST_LIMIT));
}

/**
 * The request's assigned approver resolves an RDR (BR-DL-10).
 *
 * - Replace: the rejected quantity is owed again. Once the items are back in
 *   the stockroom, the need returns to the Inventory queue (connector F).
 * - Cancel: the rejected quantity is cancelled on the request line, so the
 *   request can be Fulfilled without it (BR-RQ-11).
 *
 * The request never becomes Rejected (BR-RQ-14).
 */
export async function resolveDiscrepancy(
  actor: AppUser,
  input: ResolveDiscrepancyInput,
): Promise<{ status: string }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const rdr = await lockDiscrepancy(tx, input.internalDiscrepancyId);

    if (!rdr) {
      throw blocked("The discrepancy report does not exist.", input);
    }

    if (rdr.approverId !== actor.userId) {
      throw blocked("Only the request's assigned approver can resolve this report.", input);
    }

    if (rdr.status !== "pending_resolution") {
      throw blocked("This discrepancy report is already resolved.", {
        ...input,
        status: rdr.status,
      });
    }

    const status = input.decision === "replace" ? "replacement_approved" : "cancelled";

    if (input.decision === "cancel") {
      await cancelRequisitionLineBalance(tx, {
        requisitionId: rdr.requisitionId,
        requisitionLineId: rdr.requisitionLineId,
        quantity: rdr.affectedQty,
      });
    }

    await saveResolution(tx, rdr.internalDiscrepancyId, {
      status,
      resolutionAction: input.note,
      resolvedBy: actor.userId,
    });

    const request = await settleRequisitionAfterDelivery(tx, {
      requisitionId: rdr.requisitionId,
      actorUserId: actor.userId,
      reason:
        input.decision === "replace"
          ? "Replacement approved for rejected items"
          : "Rejected quantity cancelled",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "internal_discrepancies",
      entityId: rdr.internalDiscrepancyId,
      action: "delivery.resolve-rdr",
      details: { decision: input.decision, note: input.note, affectedQty: rdr.affectedQty },
    });

    await notifyUsers(tx, [rdr.recipientUserId], {
      type: "delivery_rdr_resolved",
      message:
        input.decision === "replace"
          ? `A replacement was approved for the rejected items on request #${rdr.requisitionId}.`
          : `The rejected quantity on request #${rdr.requisitionId} was cancelled.`,
      requisitionId: rdr.requisitionId,
    });

    if (input.decision === "replace" && request.status !== "approved") {
      await notifyRoles(tx, ["inventory_custodian"], {
        type: "delivery_replacement_approved",
        message: `A replacement was approved on request #${rdr.requisitionId}. Issue it once the rejected items are returned.`,
        requisitionId: rdr.requisitionId,
      });
    }

    await notifyAfterDeliveryEvent(tx, request, 0);

    return { status };
  });
}
