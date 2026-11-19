import "server-only";

import {
  BlockedActionError,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";

import {
  discardPurchaseOrderDraft,
  lockPurchaseOrder,
} from "../repositories/purchase-order.repository";
import type { DiscardPurchaseOrderDraftDto } from "../schemas/purchase-order.dto";

function blocked(
  message: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: 0,
    action: "purchase_order.discard",
    details,
  });
}

/**
 * Discards a PO draft that Accounting has not approved.
 *
 * The PO becomes cancelled and its lines stop allocating PR demand, so another
 * draft can claim that quantity. History is kept: lines and every revision stay
 * in the database. An approved or placed PO cannot be discarded here, because
 * cancelling committed demand needs Accounting authorization.
 */
export async function discardPurchaseOrderDraftService(
  actor: AppUser,
  dto: DiscardPurchaseOrderDraftDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "purchasing_staff") {
      throw blocked(
        "Only Purchasing Staff can discard a purchase order draft.",
        {
          purchaseOrderId: dto.purchaseOrderId,
        },
      );
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked("The purchase order no longer exists.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    if (
      purchaseOrder.status !== "pending_approval" &&
      purchaseOrder.status !== "for_revision"
    ) {
      throw blocked(
        "Only a purchase order that Accounting has not approved can be discarded.",
        {
          purchaseOrderId: dto.purchaseOrderId,
          status: purchaseOrder.status,
        },
      );
    }

    await discardPurchaseOrderDraft(tx, dto.purchaseOrderId);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.discard",
      details: {
        status: purchaseOrder.status,
        versionNo: purchaseOrder.currentVersion,
        supplierId: purchaseOrder.supplierId,
      },
    });
  });
}
