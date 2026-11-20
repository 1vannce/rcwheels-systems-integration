import "server-only";

import {
  BlockedActionError,
  notifyRoles,
  notifyUsers,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";

import {
  findPurchaseOrderLines,
  lockPurchaseOrder,
  markPurchaseOrderApproved,
  markPurchaseOrderForRevision,
  reviewPurchaseOrderRevision,
} from "../repositories/purchase-order.repository";
import type {
  ApprovePurchaseOrderDto,
  ReturnPurchaseOrderDto,
} from "../schemas/purchase-order.dto";
import { refreshPurchaseRequisitionCoverage } from "./purchase-requisition.coverage.service";

function blocked(
  message: string,
  action: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: 0,
    action,
    details,
  });
}

/**
 * Accounting approves the exact current PO version.
 *
 * The review metadata is written to that version's revision row; the snapshot
 * itself is never changed. Approval authorizes spending but does not place the
 * order or move stock.
 */
export async function approvePurchaseOrderService(
  actor: AppUser,
  dto: ApprovePurchaseOrderDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "accounting_associate") {
      throw blocked(
        "Only the Accounting Associate can approve a purchase order.",
        "purchase_order.approve",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked("The purchase order no longer exists.", "purchase_order.approve", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    if (purchaseOrder.status !== "pending_approval") {
      throw blocked(
        "Only a purchase order waiting for Accounting can be approved.",
        "purchase_order.approve",
        {
          purchaseOrderId: dto.purchaseOrderId,
          status: purchaseOrder.status,
        },
      );
    }

    if (purchaseOrder.preparedBy === actor.userId) {
      throw blocked(
        "You cannot approve a purchase order you prepared.",
        "purchase_order.approve",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw blocked(
        "Give a reason for approving the purchase order.",
        "purchase_order.approve",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const reviewedAt = new Date();
    const reviewed = await reviewPurchaseOrderRevision(tx, {
      purchaseOrderId: dto.purchaseOrderId,
      versionNo: purchaseOrder.currentVersion,
      reviewedBy: actor.userId,
      budgetOk: true,
      reviewReason: reason,
      reviewedAt,
    });

    if (!reviewed) {
      throw blocked(
        "The current version snapshot is missing, so the purchase order cannot be approved.",
        "purchase_order.approve",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    await markPurchaseOrderApproved(
      tx,
      dto.purchaseOrderId,
      actor.userId,
      reviewedAt,
    );

    const lines = await findPurchaseOrderLines(tx, dto.purchaseOrderId);
    await refreshPurchaseRequisitionCoverage(
      tx,
      actor.userId,
      lines.map((line) => line.purchaseRequisitionId),
    );

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.approve",
      details: {
        versionNo: purchaseOrder.currentVersion,
        supplierId: purchaseOrder.supplierId,
        reason,
      },
    });

    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: "purchase_order_approved",
        message: `Purchase order #${dto.purchaseOrderId} was approved by Accounting and is ready to place.`,
      },
      actor.userId,
    );
  });
}

/**
 * Accounting returns the current PO version for revision with a reason.
 * Approval fields are cleared, and no placement is possible until the next
 * version is approved.
 */
export async function returnPurchaseOrderService(
  actor: AppUser,
  dto: ReturnPurchaseOrderDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "accounting_associate") {
      throw blocked(
        "Only the Accounting Associate can return a purchase order.",
        "purchase_order.return",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked("The purchase order no longer exists.", "purchase_order.return", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    if (purchaseOrder.status !== "pending_approval") {
      throw blocked(
        "Only a purchase order waiting for Accounting can be returned.",
        "purchase_order.return",
        {
          purchaseOrderId: dto.purchaseOrderId,
          status: purchaseOrder.status,
        },
      );
    }

    const reason = dto.reason.trim();

    if (reason.length < 3) {
      throw blocked("Give a reason for returning the purchase order.", "purchase_order.return", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const reviewedAt = new Date();
    const reviewed = await reviewPurchaseOrderRevision(tx, {
      purchaseOrderId: dto.purchaseOrderId,
      versionNo: purchaseOrder.currentVersion,
      reviewedBy: actor.userId,
      budgetOk: false,
      reviewReason: reason,
      reviewedAt,
    });

    if (!reviewed) {
      throw blocked(
        "The current version snapshot is missing, so the purchase order cannot be returned.",
        "purchase_order.return",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    await markPurchaseOrderForRevision(tx, dto.purchaseOrderId);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.return",
      details: {
        versionNo: purchaseOrder.currentVersion,
        reason,
      },
    });

    await notifyUsers(tx, [purchaseOrder.preparedBy], {
      type: "purchase_order_returned",
      message: `Purchase order #${dto.purchaseOrderId} was returned for revision: ${reason}`,
    });
  });
}
