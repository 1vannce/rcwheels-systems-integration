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
  deletePurchaseOrderLines,
  findPurchaseOrderLines,
  findPurchaseRequisitionLinesForOrder,
  insertPurchaseOrderLines,
  insertPurchaseOrderRevision,
  lockPurchaseOrder,
  lockPurchaseRequisitionLines,
  resetPurchaseOrderForReview,
} from "../repositories/purchase-order.repository";
import { lockPurchaseRequisitionForOrder } from "../repositories/purchase-requisition.repository";
import { findSupplierById } from "../repositories/supplier.repository";
import type { UpdatePurchaseOrderDto } from "../schemas/purchase-order.dto";
import type { PurchaseOrderSnapshotLine } from "../types/purchasing.dto";
import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";
import { refreshPurchaseRequisitionCoverage } from "./purchase-requisition.coverage.service";

const ZERO = "0.000";

function blocked(message: string, details: Record<string, unknown>): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_orders",
    entityId: 0,
    action: "purchase_order.revise",
    details,
  });
}

/**
 * Revises a PO that has been returned for revision or approved but not yet placed.
 *
 * Every save creates a new version, stores a new snapshot, and resets the PO to
 * Pending Approval. The earlier revision rows and their reviews stay intact, so
 * a previously approved version can never authorize a changed PO.
 */
export async function updatePurchaseOrderService(
  actor: AppUser,
  dto: UpdatePurchaseOrderDto,
): Promise<{ purchaseOrderId: number; versionNo: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "purchasing_staff") {
      throw blocked("Only Purchasing Staff can revise a purchase order.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const purchaseOrder = await lockPurchaseOrder(tx, dto.purchaseOrderId);

    if (!purchaseOrder) {
      throw blocked("The purchase order no longer exists.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    if (
      purchaseOrder.status !== "for_revision" &&
      purchaseOrder.status !== "approved"
    ) {
      throw blocked(
        "Only a returned or approved purchase order can be revised before placement.",
        {
          purchaseOrderId: dto.purchaseOrderId,
          status: purchaseOrder.status,
        },
      );
    }

    const existingLines = await findPurchaseOrderLines(tx, dto.purchaseOrderId);

    if (existingLines.length === 0) {
      throw blocked("The purchase order has no lines to revise.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const purchaseRequisitionIds = [
      ...new Set(existingLines.map((line) => line.purchaseRequisitionId)),
    ];

    if (purchaseRequisitionIds.length !== 1) {
      throw blocked(
        "This purchase order spans more than one purchase request and cannot be revised here.",
        { purchaseOrderId: dto.purchaseOrderId },
      );
    }

    const purchaseRequisitionId = purchaseRequisitionIds[0];
    const purchaseRequisition = await lockPurchaseRequisitionForOrder(
      tx,
      purchaseRequisitionId,
    );

    if (!purchaseRequisition) {
      throw blocked("The source purchase request no longer exists.", {
        purchaseOrderId: dto.purchaseOrderId,
        purchaseRequisitionId,
      });
    }

    if (purchaseRequisition.status === "cancelled") {
      throw blocked("The source purchase request was cancelled.", {
        purchaseOrderId: dto.purchaseOrderId,
        purchaseRequisitionId,
      });
    }

    const requestedLineIds = dto.lines.map((line) => line.purchaseRequisitionLineId);
    const uniqueLineIds = [...new Set(requestedLineIds)];

    if (uniqueLineIds.length !== requestedLineIds.length) {
      throw blocked("Each purchase request line may appear only once.", {
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const lockedLines = await lockPurchaseRequisitionLines(tx, uniqueLineIds);

    if (lockedLines.length !== uniqueLineIds.length) {
      throw blocked("One or more lines do not belong to this purchase request.", {
        purchaseOrderId: dto.purchaseOrderId,
        purchaseRequisitionId,
      });
    }

    const supplier = await findSupplierById(tx, dto.supplierId);

    if (!supplier) {
      throw blocked("The selected supplier no longer exists.", {
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: dto.supplierId,
      });
    }

    const sourceLines = await findPurchaseRequisitionLinesForOrder(
      tx,
      purchaseRequisitionId,
      {
        excludePurchaseOrderId: dto.purchaseOrderId,
        requireOpen: false,
      },
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
        throw blocked("One or more lines do not belong to this purchase request.", {
          purchaseOrderId: dto.purchaseOrderId,
          purchaseRequisitionId,
          purchaseRequisitionLineId: submitted.purchaseRequisitionLineId,
        });
      }

      if (compareQuantities(submitted.orderedQty, ZERO) <= 0) {
        throw blocked("The ordered quantity must be above zero.", {
          purchaseOrderId: dto.purchaseOrderId,
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        });
      }

      if (compareQuantities(submitted.unitPrice, "0.00") <= 0) {
        throw blocked("The unit price must be above zero.", {
          purchaseOrderId: dto.purchaseOrderId,
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        });
      }

      if (compareQuantities(submitted.orderedQty, source.remainingQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(source.remainingQty)} ${source.unit} remains available for ${source.itemCode}.`,
          {
            purchaseOrderId: dto.purchaseOrderId,
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
        purchaseOrderId: dto.purchaseOrderId,
      });
    }

    const versionNo = purchaseOrder.currentVersion + 1;

    await deletePurchaseOrderLines(tx, dto.purchaseOrderId);
    await insertPurchaseOrderLines(tx, dto.purchaseOrderId, linesToInsert);
    await resetPurchaseOrderForReview(tx, dto.purchaseOrderId, {
      supplierId: supplier.supplierId,
      deliveryTerms: dto.deliveryTerms,
      newVersion: versionNo,
    });
    await insertPurchaseOrderRevision(tx, {
      purchaseOrderId: dto.purchaseOrderId,
      versionNo,
      changedBy: actor.userId,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: dto.deliveryTerms,
        lines: snapshotLines,
      }),
    });

    await refreshPurchaseRequisitionCoverage(tx, actor.userId, [
      purchaseRequisitionId,
    ]);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_orders",
      entityId: dto.purchaseOrderId,
      action: "purchase_order.revise",
      details: {
        fromStatus: purchaseOrder.status,
        versionNo,
        purchaseRequisitionId,
        supplierId: supplier.supplierId,
        lines: linesToInsert,
      },
    });

    await notifyRoles(
      tx,
      ["accounting_associate"],
      {
        type: "purchase_order_pending_approval",
        message: `Purchase order #${dto.purchaseOrderId} version ${versionNo} is waiting for Accounting review.`,
      },
      actor.userId,
    );

    return { purchaseOrderId: dto.purchaseOrderId, versionNo };
  });
}
