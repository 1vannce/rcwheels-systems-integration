import "server-only";

import {
  BlockedActionError,
  recordAudit,
  runBusinessEvent,
  type AppRole,
  type AppUser,
} from "@/modules/core";
import {
  acceptSupplierReceipt,
  addQuantities,
  compareQuantities,
  formatQuantity,
} from "@/modules/inventory";
import {
  lockPurchaseOrderForReceivingService,
  settlePurchaseOrderAfterReceiptService,
  type PurchaseOrderStatus,
} from "@/modules/purchasing";

import {
  insertSupplierReceipt,
  insertSupplierReceiptLines,
} from "../repositories/supplier-receipt.repository";
import type { ReceiveSupplierDeliveryInput } from "../schemas/delivery.schema";
import type { SupplierReceiptResult } from "../types/delivery.type";
import { followUpSupplierReceipt } from "./supplier-receipt-follow-up.service";

const ACTION = "supplier_receipt.receive";

/** Recording accept or reject is the inspection, which is the Custodian's alone (BR-SR-03). */
const RECEIVING_ROLES: readonly AppRole[] = ["inventory_custodian"];

/** Goods are received only against these PO states (BR-SR-01). */
const RECEIVABLE_STATUSES: readonly PurchaseOrderStatus[] = ["placed", "partially_received"];

function blocked(
  purchaseOrderId: number,
  message: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: purchaseOrderId,
    action: ACTION,
    details,
  });
}

/**
 * Records a supplier delivery against a placed PO and inspects it, in one
 * transaction.
 *
 * Each line is checked against the PO line's outstanding balance (ordered
 * minus cancelled minus accepted, BR-SR-04), so a follow-up delivery is
 * checked against what is left, not the original order. Delivering more than
 * the balance is blocked; the excess is a matter for an SDR. Accepted
 * quantity posts to usable stock once per receipt line through the inventory
 * stock service (BR-SR-05); rejected quantity never enters stock. The PO then
 * moves to Partially Received or Closed (BR-SR-09). The receipt, its lines,
 * the stock movements, the status change and the audit entries commit
 * together or not at all. The same transaction resolves delivered
 * replacements, opens SDRs for rejected or short quantities, and flags
 * requests awaiting the items (connector D).
 */
export async function receiveSupplierDelivery(
  actor: AppUser,
  input: ReceiveSupplierDeliveryInput,
): Promise<SupplierReceiptResult> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const { purchaseOrderId } = input;

    if (!RECEIVING_ROLES.includes(actor.role)) {
      throw blocked(
        purchaseOrderId,
        "Only the Inventory Custodian can receive supplier deliveries.",
        { purchaseOrderId, role: actor.role },
      );
    }

    const purchaseOrder = await lockPurchaseOrderForReceivingService(tx, purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked(purchaseOrderId, "The purchase order no longer exists.", { purchaseOrderId });
    }

    if (!RECEIVABLE_STATUSES.includes(purchaseOrder.status) || purchaseOrder.cancelledAt) {
      throw blocked(
        purchaseOrderId,
        "Goods can only be received against a placed or partially received purchase order.",
        { purchaseOrderId, status: purchaseOrder.status },
      );
    }

    const poLines = new Map(purchaseOrder.lines.map((line) => [line.purchaseOrderLineId, line]));
    const seen = new Set<number>();
    let totalAccepted = "0";

    for (const line of input.lines) {
      const poLine = poLines.get(line.purchaseOrderLineId);
      const details = { purchaseOrderId, purchaseOrderLineId: line.purchaseOrderLineId };

      if (!poLine) {
        throw blocked(purchaseOrderId, "A delivered line is not on this purchase order.", details);
      }

      if (seen.has(line.purchaseOrderLineId)) {
        throw blocked(purchaseOrderId, "Record each purchase order line once.", details);
      }

      seen.add(line.purchaseOrderLineId);

      if (compareQuantities(addQuantities(line.acceptedQty, line.rejectedQty), line.deliveredQty) !== 0) {
        throw blocked(
          purchaseOrderId,
          `Accepted and rejected quantities for ${poLine.itemName} must add up to the delivered quantity.`,
          { ...details, ...line },
        );
      }

      if (compareQuantities(line.deliveredQty, poLine.outstandingQty) > 0) {
        throw blocked(
          purchaseOrderId,
          `Only ${formatQuantity(poLine.outstandingQty)} ${poLine.unit} of ${poLine.itemName} is outstanding on this purchase order. Record the excess in a supplier discrepancy report.`,
          { ...details, deliveredQty: line.deliveredQty, outstandingQty: poLine.outstandingQty },
        );
      }

      totalAccepted = addQuantities(totalAccepted, line.acceptedQty);
    }

    const supplierReceiptId = await insertSupplierReceipt(tx, {
      purchaseOrderId,
      receivedBy: actor.userId,
      deliveryReceiptNo: input.deliveryReceiptNo,
      invoiceNo: input.invoiceNo || null,
    });
    const receiptLines = await insertSupplierReceiptLines(
      tx,
      supplierReceiptId,
      input.lines.map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        deliveredQty: line.deliveredQty,
        acceptedQty: line.acceptedQty,
        rejectedQty: line.rejectedQty,
        inspectionNotes: line.inspectionNotes || null,
      })),
    );

    // Stock posts once per accepted receipt line; the stock service's event
    // key refuses a second posting of the same line (BR-SR-05). Lines post in
    // item ID order so the balance locks cannot deadlock another event (PLAN
    // rule 10).
    const movementIds: number[] = [];
    const itemIdOf = (purchaseOrderLineId: number) => poLines.get(purchaseOrderLineId)?.itemId ?? 0;
    const postingOrder = [...receiptLines].sort(
      (a, b) =>
        itemIdOf(a.purchaseOrderLineId) - itemIdOf(b.purchaseOrderLineId) ||
        a.supplierReceiptLineId - b.supplierReceiptLineId,
    );

    for (const line of postingOrder) {
      if (compareQuantities(line.acceptedQty, "0") > 0) {
        const { movementId } = await acceptSupplierReceipt(tx, {
          supplierReceiptLineId: line.supplierReceiptLineId,
        });
        movementIds.push(movementId);
      }
    }

    // A fully rejected delivery leaves the PO status as it was.
    const purchaseOrderStatus =
      compareQuantities(totalAccepted, "0") > 0
        ? (
            await settlePurchaseOrderAfterReceiptService(tx, {
              actorUserId: actor.userId,
              purchaseOrderId,
              previousStatus: purchaseOrder.status,
              supplierReceiptId,
            })
          ).status
        : purchaseOrder.status;

    const followUp = await followUpSupplierReceipt(tx, actor, {
      supplierReceiptId,
      deliveryReceiptNo: input.deliveryReceiptNo,
      purchaseOrder,
      lines: input.lines.map((line) => ({
        ...line,
        supplierReceiptLineId: receiptLines.find(
          (receiptLine) => receiptLine.purchaseOrderLineId === line.purchaseOrderLineId,
        )!.supplierReceiptLineId,
      })),
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_receipts",
      entityId: supplierReceiptId,
      action: ACTION,
      details: {
        purchaseOrderId,
        deliveryReceiptNo: input.deliveryReceiptNo,
        invoiceNo: input.invoiceNo || null,
        previousStatus: purchaseOrder.status,
        purchaseOrderStatus,
        ...followUp,
        lines: input.lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          outstandingQty: poLines.get(line.purchaseOrderLineId)?.outstandingQty,
          deliveredQty: line.deliveredQty,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty,
        })),
      },
    });

    return {
      supplierReceiptId,
      purchaseOrderStatus,
      supplierReceiptLineIds: receiptLines.map((line) => line.supplierReceiptLineId),
      movementIds,
      ...followUp,
    };
  });
}
