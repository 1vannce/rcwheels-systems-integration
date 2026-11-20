import "server-only";

import {
  BlockedActionError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { compareQuantities, subtractQuantities } from "@/modules/inventory";

import {
  findPurchaseOrderLines,
  lockPurchaseOrder,
  markPurchaseOrderBalanceCancelled,
  setPurchaseOrderLineCancelledQuantities,
} from "../repositories/purchase-order.repository";
import { findPurchaseRequisitionStatuses } from "../repositories/purchase-requisition.repository";
import type { CancelPurchaseOrderBalanceDto } from "../schemas/purchase-order.dto";
import type { PurchaseOrderStatus } from "../types/purchasing.dto";
import { refreshPurchaseRequisitionCoverage } from "./purchase-requisition.coverage.service";

const CANCELLABLE_STATUSES: readonly PurchaseOrderStatus[] = [
  "approved",
  "placed",
  "partially_received",
];

function blocked(
  purchaseOrderId: number,
  message: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: purchaseOrderId,
    action: "purchase_order.cancel_balance",
    details,
  });
}

/**
 * Accounting cancels the whole remaining balance of an approved, placed, or
 * partially received PO.
 *
 * The remaining quantity is ordered minus cancelled and accepted. A partially
 * received PO becomes closed so its accepted quantity still counts toward PR
 * coverage; an unreceived PO becomes cancelled. The source PR is re-derived in
 * the same transaction, and the reopened PR is connector G's demand review.
 * No stock is posted and no requisition is cancelled.
 *
 * The PO header lock serializes this with the other PO services. Receiving is
 * not built yet; when it is, it must use the same header lock or a line lock.
 */
export async function cancelPurchaseOrderBalanceService(
  actor: AppUser,
  dto: CancelPurchaseOrderBalanceDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "accounting_associate") {
      throw blocked(
        dto.purchaseOrderId,
        "Only the Accounting Associate can cancel a purchase order balance.",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked(
        dto.purchaseOrderId,
        "The purchase order no longer exists.",
        {
          purchaseOrderId: dto.purchaseOrderId,
        },
      );
    }

    if (purchaseOrder.cancelledAt !== null) {
      throw blocked(
        dto.purchaseOrderId,
        "The balance of this purchase order was already cancelled.",
        {
          purchaseOrderId: dto.purchaseOrderId,
        },
      );
    }

    if (!CANCELLABLE_STATUSES.includes(purchaseOrder.status)) {
      if (
        purchaseOrder.status === "pending_approval" ||
        purchaseOrder.status === "for_revision"
      ) {
        throw blocked(
          dto.purchaseOrderId,
          "Only an approved, placed, or partially received purchase order can have its balance cancelled. Discard an unapproved draft instead.",
          {
            purchaseOrderId: dto.purchaseOrderId,
            status: purchaseOrder.status,
          },
        );
      }

      throw blocked(
        dto.purchaseOrderId,
        "This purchase order is already closed or cancelled.",
        {
          purchaseOrderId: dto.purchaseOrderId,
          status: purchaseOrder.status,
        },
      );
    }

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw blocked(
        dto.purchaseOrderId,
        "Give a reason for cancelling the purchase order balance.",
        {
          purchaseOrderId: dto.purchaseOrderId,
        },
      );
    }

    const lines = await findPurchaseOrderLines(tx, dto.purchaseOrderId);
    const linesToCancel = lines.filter(
      (line) => compareQuantities(line.outstandingQty, "0") > 0,
    );

    if (linesToCancel.length === 0) {
      throw blocked(
        dto.purchaseOrderId,
        "There is no remaining balance to cancel.",
        {
          purchaseOrderId: dto.purchaseOrderId,
        },
      );
    }

    const cancelledAt = new Date();
    const anyAccepted = lines.some(
      (line) => compareQuantities(line.acceptedQty, "0") > 0,
    );
    const finalStatus = anyAccepted ? "closed" : "cancelled";
    const lineUpdates = linesToCancel.map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      cancelledQty: subtractQuantities(line.orderedQty, line.acceptedQty),
    }));

    await setPurchaseOrderLineCancelledQuantities(
      tx,
      dto.purchaseOrderId,
      lineUpdates,
    );
    await markPurchaseOrderBalanceCancelled(tx, {
      purchaseOrderId: dto.purchaseOrderId,
      cancelledBy: actor.userId,
      cancelledAt,
      cancellationReason: reason,
      status: finalStatus,
    });

    const purchaseRequisitionIds = [
      ...new Set(lines.map((line) => line.purchaseRequisitionId)),
    ];
    await refreshPurchaseRequisitionCoverage(
      tx,
      actor.userId,
      purchaseRequisitionIds,
    );

    const openPurchaseRequisitionIds = (
      await findPurchaseRequisitionStatuses(tx, purchaseRequisitionIds)
    )
      .filter((row) => row.status === "open")
      .map((row) => row.purchaseRequisitionId);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.cancel_balance",
      details: {
        previousStatus: purchaseOrder.status,
        finalStatus,
        reason,
        openPurchaseRequisitionIds,
        lines: linesToCancel.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          orderedQty: line.orderedQty,
          acceptedQty: line.acceptedQty,
          cancelledQty: subtractQuantities(line.orderedQty, line.acceptedQty),
        })),
      },
    });

    const purchaseRequestList = openPurchaseRequisitionIds
      .map((id) => `#${id}`)
      .join(", ");
    const demandReview =
      openPurchaseRequisitionIds.length === 0
        ? ""
        : ` Review purchase request${
            openPurchaseRequisitionIds.length === 1 ? "" : "s"
          } ${purchaseRequestList} in the PR queue for uncovered demand.`;

    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: "purchase_order_balance_cancelled",
        message: `The remaining balance of purchase order #${dto.purchaseOrderId} was cancelled.${demandReview}`,
      },
      actor.userId,
    );
  });
}
