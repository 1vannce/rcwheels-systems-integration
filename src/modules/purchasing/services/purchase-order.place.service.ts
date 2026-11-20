import "server-only";

import {
  BlockedActionError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";

import {
  isPurchaseOrderCurrentVersionApproved,
  lockPurchaseOrder,
  markPurchaseOrderPlaced,
} from "../repositories/purchase-order.repository";
import type { PlacePurchaseOrderDto } from "../schemas/purchase-order.dto";

function blocked(message: string, details: Record<string, unknown>): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: 0,
    action: "purchase_order.place",
    details,
  });
}

/**
 * Places an approved PO with the supplier and hands it to Supplier Receiving
 * (connector E). The order timestamp is recorded; stock is not touched here.
 */
export async function placePurchaseOrderService(
  actor: AppUser,
  dto: PlacePurchaseOrderDto,
): Promise<{ purchaseOrderId: number; status: "placed" }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "purchasing_staff") {
      throw blocked("Only Purchasing Staff can place a purchase order.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked("The purchase order no longer exists.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    if (purchaseOrder.status !== "approved") {
      throw blocked("Only an approved purchase order can be placed.", {
        purchaseOrderId: dto.purchaseOrderId,
        status: purchaseOrder.status,
      });
    }

    if (!(await isPurchaseOrderCurrentVersionApproved(tx, dto.purchaseOrderId))) {
      throw blocked(
        "The current purchase order version has not been approved by Accounting.",
        {
          purchaseOrderId: dto.purchaseOrderId,
          versionNo: purchaseOrder.currentVersion,
        },
      );
    }

    const orderedAt = new Date();

    await markPurchaseOrderPlaced(tx, dto.purchaseOrderId, orderedAt);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.place",
      details: {
        versionNo: purchaseOrder.currentVersion,
        supplierId: purchaseOrder.supplierId,
        orderedAt: orderedAt.toISOString(),
      },
    });

    await notifyRoles(
      tx,
      ["delivery_operations"],
      {
        type: "purchase_order_placed",
        message: `Purchase order #${dto.purchaseOrderId} was placed and is ready for supplier receiving.`,
      },
      actor.userId,
    );

    return { purchaseOrderId: dto.purchaseOrderId, status: "placed" };
  });
}
