import "server-only";

import type { Tx } from "@/db";
import { notifyRoles, recordAudit } from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";

import {
  findPurchaseOrderLines,
  lockPurchaseOrder,
  setPurchaseOrderReceivingStatus,
} from "../repositories/purchase-order.repository";
import type {
  PurchaseOrderForReceivingDto,
  PurchaseOrderStatus,
} from "../types/purchasing.dto";

// PO reads and status changes for Supplier Receiving (delivery module). Both
// run inside the receiving transaction, so the PO balance, the stock posting,
// and the status change commit together.

/**
 * Locks the PO header and reads its lines with the outstanding balance
 * (ordered minus cancelled minus accepted). The header lock is the same one
 * the other PO services take, so a receipt cannot race a balance cancellation
 * or a second receipt against the same PO.
 */
export async function lockPurchaseOrderForReceivingService(
  tx: Tx,
  purchaseOrderId: number,
): Promise<PurchaseOrderForReceivingDto | null> {
  const header = await lockPurchaseOrder(tx, purchaseOrderId);

  if (!header) {
    return null;
  }

  return {
    purchaseOrderId: header.purchaseOrderId,
    status: header.status,
    cancelledAt: header.cancelledAt,
    lines: await findPurchaseOrderLines(tx, purchaseOrderId),
  };
}

/**
 * Re-derives the PO status after accepted quantity was recorded (BR-SR-09):
 * Closed once every line is fully received or cancelled, otherwise Partially
 * Received. The caller must hold the header lock from
 * lockPurchaseOrderForReceivingService. PR coverage does not change, because
 * it counts ordered minus cancelled quantity, which receiving never touches.
 */
export async function settlePurchaseOrderAfterReceiptService(
  tx: Tx,
  input: {
    actorUserId: number;
    purchaseOrderId: number;
    previousStatus: PurchaseOrderStatus;
    supplierReceiptId: number;
  },
): Promise<{ status: "partially_received" | "closed" }> {
  const lines = await findPurchaseOrderLines(tx, input.purchaseOrderId);
  const status = lines.every((line) => compareQuantities(line.outstandingQty, "0") === 0)
    ? "closed"
    : "partially_received";

  if (status !== input.previousStatus) {
    await setPurchaseOrderReceivingStatus(tx, input.purchaseOrderId, status);
    await recordAudit(tx, {
      actorUserId: input.actorUserId,
      entityType: "purchase_orders",
      entityId: input.purchaseOrderId,
      action: status === "closed" ? "purchase_order.close" : "purchase_order.partially_receive",
      details: {
        previousStatus: input.previousStatus,
        status,
        supplierReceiptId: input.supplierReceiptId,
        lines: lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          orderedQty: line.orderedQty,
          cancelledQty: line.cancelledQty,
          acceptedQty: line.acceptedQty,
          outstandingQty: line.outstandingQty,
        })),
      },
    });
    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: status === "closed" ? "purchase_order_closed" : "purchase_order_partially_received",
        message:
          status === "closed"
            ? `Purchase order #${input.purchaseOrderId} is fully received and closed.`
            : `Purchase order #${input.purchaseOrderId} is partially received. Follow up the outstanding balance.`,
      },
      input.actorUserId,
    );
  }

  return { status };
}
