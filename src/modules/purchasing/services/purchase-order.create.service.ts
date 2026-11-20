import "server-only";

import {
  BlockedActionError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { compareQuantities, formatQuantity } from "@/modules/inventory";

import {
  findOpenPurchaseRequisitionLinesForOrder,
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  insertPurchaseOrderRevision,
  lockPurchaseRequisitionLines,
} from "../repositories/purchase-order.repository";
import { lockPurchaseRequisitionForOrder } from "../repositories/purchase-requisition.repository";
import { findSupplierById } from "../repositories/supplier.repository";
import type { CreatePurchaseOrderDto } from "../schemas/purchase-order.dto";
import type { PurchaseOrderSnapshotLine } from "../types/purchasing.dto";
import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";

const ZERO = "0.00";

function blocked(
  message: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: 0,
    action: "purchase_order.create",
    details,
  });
}

/**
 * Creates a pending PO draft from one open shortage PR.
 *
 * The PR header and its selected lines are locked before the remaining
 * quantities are recalculated, so two Purchasing Staff members cannot claim the
 * same demand. The PO starts as Pending Approval, stores version 1, and never
 * changes stock.
 */
export async function createPurchaseOrderService(
  actor: AppUser,
  dto: CreatePurchaseOrderDto,
): Promise<{ purchaseOrderId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "purchasing_staff") {
      throw blocked("Only Purchasing Staff can prepare a purchase order.", {
        purchaseRequisitionId: dto.purchaseRequisitionId,
      });
    }

    const requestedLineIds = dto.lines.map(
      (line) => line.purchaseRequisitionLineId,
    );
    const uniqueLineIds = [...new Set(requestedLineIds)];

    if (uniqueLineIds.length !== requestedLineIds.length) {
      throw blocked("Each purchase request line may appear only once.", {
        purchaseRequisitionId: dto.purchaseRequisitionId,
      });
    }

    const purchaseRequisition = await lockPurchaseRequisitionForOrder(
      tx,
      dto.purchaseRequisitionId,
    );

    if (!purchaseRequisition) {
      throw blocked("The purchase request no longer exists.", {
        purchaseRequisitionId: dto.purchaseRequisitionId,
      });
    }

    if (purchaseRequisition.status !== "open") {
      throw blocked(
        "Only an open purchase request can become a purchase order.",
        {
          purchaseRequisitionId: dto.purchaseRequisitionId,
          status: purchaseRequisition.status,
        },
      );
    }

    const lockedLines = await lockPurchaseRequisitionLines(tx, uniqueLineIds);

    if (lockedLines.length !== uniqueLineIds.length) {
      throw blocked(
        "One or more lines do not belong to this purchase request.",
        {
          purchaseRequisitionId: dto.purchaseRequisitionId,
        },
      );
    }

    const supplier = await findSupplierById(tx, dto.supplierId);

    if (!supplier) {
      throw blocked("The selected supplier no longer exists.", {
        purchaseRequisitionId: dto.purchaseRequisitionId,
        supplierId: dto.supplierId,
      });
    }

    const sourceLines = await findOpenPurchaseRequisitionLinesForOrder(
      tx,
      dto.purchaseRequisitionId,
    );
      
    const sourceByLine = new Map(
      sourceLines.map((line) => [line.purchaseRequisitionLineId, line]),
    );
      
    const linesToInsert: {
      purchaseRequisitionLineId: number;
      orderedQty: string;
      unitPrice: string;
    }[] = [];
      
    const snapshotLines: PurchaseOrderSnapshotLine[] = [];

    for (const submitted of dto.lines) {
      const source = sourceByLine.get(submitted.purchaseRequisitionLineId);

      if (!source) {
        throw blocked(
          "One or more lines do not belong to this purchase request.",
          {
            purchaseRequisitionId: dto.purchaseRequisitionId,
            purchaseRequisitionLineId: submitted.purchaseRequisitionLineId,
          },
        );
      }

      if (compareQuantities(submitted.orderedQty, ZERO) <= 0) {
        throw blocked("The ordered quantity must be above zero.", {
          purchaseRequisitionId: dto.purchaseRequisitionId,
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        });
      }

      if (compareQuantities(submitted.unitPrice, "0.00") <= 0) {
        throw blocked("The unit price must be above zero.", {
          purchaseRequisitionId: dto.purchaseRequisitionId,
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        });
      }

      if (compareQuantities(source.remainingQty, ZERO) <= 0) {
        throw blocked(
          `${source.itemCode} is already fully covered by purchase orders.`,
          {
            purchaseRequisitionId: dto.purchaseRequisitionId,
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          },
        );
      }

      if (compareQuantities(submitted.orderedQty, source.remainingQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(source.remainingQty)} ${source.unit} remains to order for ${source.itemCode}.`,
          {
            purchaseRequisitionId: dto.purchaseRequisitionId,
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: submitted.orderedQty,
            remainingQty: source.remainingQty,
          },
        );
      }

      linesToInsert.push({
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: submitted.orderedQty,
        unitPrice: submitted.unitPrice,
      });
      snapshotLines.push({
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        itemId: source.itemId,
        itemCode: source.itemCode,
        itemName: source.itemName,
        unit: source.unit,
        orderedQty: submitted.orderedQty,
        unitPrice: submitted.unitPrice,
      });
    }

    if (linesToInsert.length === 0) {
      throw blocked("Add at least one line to the purchase order.", {
        purchaseRequisitionId: dto.purchaseRequisitionId,
      });
    }

    const purchaseOrderId = await insertPurchaseOrder(tx, {
      supplierId: supplier.supplierId,
      preparedBy: actor.userId,
      deliveryTerms: dto.deliveryTerms,
    });

    await insertPurchaseOrderLines(tx, purchaseOrderId, linesToInsert);
    await insertPurchaseOrderRevision(tx, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: actor.userId,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: dto.deliveryTerms,
        lines: snapshotLines,
      }),
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: purchaseOrderId,
      action: "purchase_order.create",
      details: {
        purchaseRequisitionId: dto.purchaseRequisitionId,
        supplierId: supplier.supplierId,
        lines: linesToInsert,
      },
    });

    const sourceRequisitionId =
      sourceLines.find((line) => line.requisitionId !== null)?.requisitionId ??
      null;

    await notifyRoles(
      tx,
      ["accounting_associate"],
      {
        type: "purchase_order_pending_approval",
        message: `Purchase order #${purchaseOrderId} from purchase request #${dto.purchaseRequisitionId} is waiting for Accounting review.`,
        ...(sourceRequisitionId === null
          ? {}
          : { requisitionId: sourceRequisitionId }),
      },
      actor.userId,
    );

    return { purchaseOrderId };
  });
}
