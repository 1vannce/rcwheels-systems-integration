import "server-only";

import {
  BlockedActionError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import { compareQuantities, formatQuantity } from "@/modules/inventory";
import { getRequisitionForPurchaseService } from "@/modules/requisition";

import {
  findAllocatedPurchaseQuantities,
  findOpenPurchaseRequisitionLines,
  insertPurchaseRequisition,
  insertPurchaseRequisitionLines,
} from "../repositories/purchase-requisition.repository";
import type { CreateShortagePurchaseRequisitionDto } from "../schemas/purchase-requisition.dto";
import { formatPrNumber } from "../utils/pr-number.util";
import { calculateUncoveredShortfall } from "./purchase-requisition.shortfall";

const ZERO = "0.000";

function blocked(message: string, details: Record<string, unknown>): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "purchase_requisitions",
    entityId: 0,
    action: "purchase_requisition.create",
    details,
  });
}

/**
 * Raises a shortage purchase request for the still-uncovered quantity on an
 * awaiting-stock request. The Custodian may lower a line, never raise it above
 * the uncovered need or duplicate an open PR.
 */
export async function createShortagePurchaseRequisitionService(
  actor: AppUser,
  dto: CreateShortagePurchaseRequisitionDto,
): Promise<{ purchaseRequisitionId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (actor.role !== "inventory_custodian") {
      throw blocked("Only the Inventory Custodian can raise a purchase request.", {
        requisitionId: dto.requisitionId,
      });
    }

    const source = await getRequisitionForPurchaseService(tx, dto.requisitionId);

    if (!source) {
      throw blocked("The request no longer exists.", { requisitionId: dto.requisitionId });
    }

    if (source.requisition.status !== "awaiting_stock") {
      throw blocked(
        "Only a request awaiting stock can have a shortage purchase request.",
        { requisitionId: dto.requisitionId, status: source.requisition.status },
      );
    }

    const lineById = new Map(source.lines.map((line) => [line.requisitionLineId, line]));
    const selectedLineIds = dto.lines.map((line) => line.requisitionLineId);
    const allocated = await findAllocatedPurchaseQuantities(tx, selectedLineIds);
    const openPrLines = await findOpenPurchaseRequisitionLines(tx, selectedLineIds);
    const allocatedByLine = new Map(
      allocated.map((row) => [row.requisitionLineId, row.allocatedQty]),
    );
    const openPrLineIds = new Set(openPrLines.map((row) => row.requisitionLineId));
    const linesToInsert: {
      requisitionLineId: number;
      itemId: number;
      requestedQty: string;
    }[] = [];

    for (const submitted of dto.lines) {
      const line = lineById.get(submitted.requisitionLineId);

      if (!line) {
        throw blocked("A line does not belong to this request.", {
          requisitionId: dto.requisitionId,
          requisitionLineId: submitted.requisitionLineId,
        });
      }

      if (openPrLineIds.has(line.requisitionLineId)) {
        throw blocked(
          `An open purchase request already covers ${line.itemCode}.`,
          {
            requisitionId: dto.requisitionId,
            requisitionLineId: line.requisitionLineId,
          },
        );
      }

      if (compareQuantities(line.availableStock, ZERO) > 0) {
        throw blocked(
          `${formatQuantity(line.availableStock)} ${line.unit} is now available for ${line.itemCode}. Reserve it before raising a purchase request.`,
          {
            requisitionId: dto.requisitionId,
            requisitionLineId: line.requisitionLineId,
            availableStock: line.availableStock,
          },
        );
      }

      const allocatedQty = allocatedByLine.get(line.requisitionLineId) ?? ZERO;
      const uncoveredQty = calculateUncoveredShortfall(
        line.reservableQty,
        allocatedQty,
      );

      if (compareQuantities(submitted.requestedQty, uncoveredQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(uncoveredQty)} ${line.unit} is still uncovered for ${line.itemCode}.`,
          {
            requisitionId: dto.requisitionId,
            requisitionLineId: line.requisitionLineId,
            requestedQty: submitted.requestedQty,
            uncoveredQty,
          },
        );
      }

      linesToInsert.push({
        requisitionLineId: line.requisitionLineId,
        itemId: line.itemId,
        requestedQty: submitted.requestedQty,
      });
    }

    const purchaseRequisitionId = await insertPurchaseRequisition(tx, {
      requestedBy: actor.userId,
      requestReason: "shortage",
    });

    await insertPurchaseRequisitionLines(tx, purchaseRequisitionId, linesToInsert);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "purchase_requisitions",
      entityId: purchaseRequisitionId,
      action: "purchase_requisition.create",
      details: {
        requisitionId: dto.requisitionId,
        requestReason: "shortage",
        lines: linesToInsert,
      },
    });

    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: "purchase_requisition_created",
        message: `Purchase request ${formatPrNumber(purchaseRequisitionId)} was raised for request #${dto.requisitionId} (${linesToInsert.length} line${linesToInsert.length === 1 ? "" : "s"}).`,
        requisitionId: dto.requisitionId,
      },
      actor.userId,
    );

    return { purchaseRequisitionId };
  });
}
