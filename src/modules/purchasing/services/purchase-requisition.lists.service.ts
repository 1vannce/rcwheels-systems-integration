import "server-only";

import { db } from "@/db";
import { type AppUser } from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";
import { getRequisitionDetailService } from "@/modules/requisition";

import {
  countOpenPurchaseRequisitionRows,
  findAllocatedPurchaseQuantities,
  findOpenPurchaseRequisitionForRequisition,
  findOpenPurchaseRequisitionLines,
  findOpenPurchaseRequisitions,
} from "../repositories/purchase-requisition.repository";
import type {
  PurchaseRequisitionDto,
  PurchaseRequestContextDto,
} from "../types/purchasing.dto";
import { calculateUncoveredShortfall } from "./purchase-requisition.shortfall";

const ZERO = "0.000";
const PURCHASE_REQUISITION_LIST_LIMIT = 100;

/** Read-only count for the dashboard cards; the caller decides who may see it. */
export async function countOpenPurchaseRequisitionsService(): Promise<number> {
  return countOpenPurchaseRequisitionRows(db);
}

/** Open shortage and reorder PRs, oldest first. */
export async function listOpenPurchaseRequisitionsService(): Promise<PurchaseRequisitionDto[]> {
  return findOpenPurchaseRequisitions(db, PURCHASE_REQUISITION_LIST_LIMIT);
}

/**
 * The Custodian's view of what still needs buying on one request. A line is
 * actionable only when it has uncovered need, no available stock to reserve
 * first, and no open PR already covering it.
 */
export async function getPurchaseRequestContextService(
  actor: AppUser,
  requisitionId: number,
): Promise<PurchaseRequestContextDto> {
  const empty: PurchaseRequestContextDto = {
    canCreate: false,
    openPurchaseRequisition: null,
    lines: [],
  };

  if (actor.role !== "inventory_custodian") {
    return empty;
  }

  const detail = await getRequisitionDetailService(actor, requisitionId);

  if (!detail || detail.requisition.status !== "awaiting_stock") {
    return empty;
  }

  const lineIds = detail.lines.map((line) => line.requisitionLineId);
  const [allocated, openLines, openPr] = await Promise.all([
    findAllocatedPurchaseQuantities(db, lineIds),
    findOpenPurchaseRequisitionLines(db, lineIds),
    findOpenPurchaseRequisitionForRequisition(db, requisitionId),
  ]);
  const allocatedByLine = new Map(
    allocated.map((row) => [row.requisitionLineId, row.allocatedQty]),
  );
  const openPrByLine = new Map(
    openLines.map((row) => [row.requisitionLineId, row.purchaseRequisitionId]),
  );

  const lines = detail.lines.map((line) => {
    const allocatedPoQty = allocatedByLine.get(line.requisitionLineId) ?? ZERO;
    const uncoveredQty = calculateUncoveredShortfall(
      line.reservableQty,
      allocatedPoQty,
    );

    return {
      requisitionLineId: line.requisitionLineId,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      needQty: line.reservableQty,
      allocatedPoQty,
      uncoveredQty,
      availableQty: line.availableStock,
      openPurchaseRequisitionId: openPrByLine.get(line.requisitionLineId) ?? null,
    };
  });

  const canCreate = lines.some(
    (line) =>
      compareQuantities(line.uncoveredQty, ZERO) > 0 &&
      compareQuantities(line.availableQty, ZERO) <= 0 &&
      line.openPurchaseRequisitionId === null,
  );

  return {
    canCreate,
    openPurchaseRequisition: openPr,
    lines,
  };
}
