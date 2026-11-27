import "server-only";

import type { Tx } from "@/db";
import { notifyRoles, recordAudit } from "@/modules/core";

import {
  findAvailableQuantity,
  findItemForReorder,
  findOpenPurchaseOrderCoverage,
  findOpenPurchaseRequisitionCoverage,
  hasReorderAlert,
  REORDER_ALERT_ACTION,
} from "../repositories/reorder.repository";
import { lockBalance } from "../repositories/stock.repository";
import type { ReorderCheckResult, ReorderCoverage } from "../types/reorder.type";
import { addQuantities, compareQuantities, formatQuantity } from "./quantity.service";

// Reorder alert (PLAN section 7 "Reorder check", BR-IN-43 and BR-IN-44).
//
// An alert is raised when available stock crosses from above the reorder point
// to at or below it. It stays unresolved while available stays at or below the
// point, so further deductions do not alert again; once stock rises above the
// point, the next crossing alerts again. An item that is already at or below
// its point but has never been alerted (for example, stock that was low before
// this check existed) alerts on its next lowering event. The alert only
// informs: it never creates a purchase requisition. A reorder point of zero
// means none is set.

export const REORDER_ALERT_TYPE = "stock.reorder_alert";

const ZERO = "0.000";
const ALERT_ROLES = ["inventory_custodian", "inventory_manager"] as const;

/** Same display format as the purchasing module's PO number. */
function poNumber(purchaseOrderId: number): string {
  return `PO-${String(purchaseOrderId).padStart(4, "0")}`;
}

async function findCoverage(tx: Tx, itemId: number): Promise<ReorderCoverage> {
  const purchaseOrders = await findOpenPurchaseOrderCoverage(tx, itemId);
  const purchaseRequisitions = await findOpenPurchaseRequisitionCoverage(tx, itemId);
  const totalQty = [
    ...purchaseOrders.map((po) => po.outstandingQty),
    ...purchaseRequisitions.map((pr) => pr.unorderedQty),
  ].reduce(addQuantities, ZERO);

  return { purchaseOrders, purchaseRequisitions, totalQty };
}

function describeCoverage(coverage: ReorderCoverage, unit: string): string {
  const parts = [
    ...coverage.purchaseOrders.map(
      (po) => `${poNumber(po.purchaseOrderId)} ${formatQuantity(po.outstandingQty)} ${unit} outstanding`,
    ),
    ...coverage.purchaseRequisitions.map(
      (pr) => `PR #${pr.purchaseRequisitionId} ${formatQuantity(pr.unorderedQty)} ${unit} not yet ordered`,
    ),
  ];

  if (parts.length === 0) {
    return "No open purchase requisition or purchase order covers this item.";
  }

  return `Open coverage: ${parts.join("; ")}. Check it before raising a reorder purchase requisition.`;
}

/** At or below the reorder point. A point of zero means none is set. */
export function isAtOrBelowReorderPoint(available: string, reorderPoint: string): boolean {
  return compareQuantities(reorderPoint, ZERO) > 0 && compareQuantities(available, reorderPoint) <= 0;
}

/**
 * Runs after a stock event that can lower available stock, inside that event's
 * transaction and while it still holds the item's usable balance lock.
 * `previousReorderPoint` is passed only when the reorder point itself changed.
 */
export async function checkReorder(
  tx: Tx,
  input: {
    itemId: number;
    availableBefore: string;
    availableAfter: string;
    previousReorderPoint?: string;
  },
): Promise<ReorderCheckResult> {
  const item = await findItemForReorder(tx, input.itemId);

  if (!item || !isAtOrBelowReorderPoint(input.availableAfter, item.reorderPoint)) {
    return { alerted: false };
  }

  const pointBefore = input.previousReorderPoint ?? item.reorderPoint;
  // A point of zero is "none set", so no alert could have been outstanding.
  const wasAbove =
    compareQuantities(pointBefore, ZERO) <= 0 ||
    compareQuantities(input.availableBefore, pointBefore) > 0;

  if (!wasAbove && (await hasReorderAlert(tx, input.itemId))) {
    return { alerted: false };
  }

  const coverage = await findCoverage(tx, input.itemId);
  const message =
    `Reorder alert: ${item.itemCode} (${item.itemName}) has ${formatQuantity(input.availableAfter)} ${item.unit} available, ` +
    `at or below its reorder point of ${formatQuantity(item.reorderPoint)}. ` +
    describeCoverage(coverage, item.unit);

  await notifyRoles(tx, ALERT_ROLES, { type: REORDER_ALERT_TYPE, message });
  await recordAudit(tx, {
    actorUserId: null,
    entityType: "items",
    entityId: input.itemId,
    action: REORDER_ALERT_ACTION,
    details: {
      available: input.availableAfter,
      reorderPoint: item.reorderPoint,
      coverageQty: coverage.totalQty,
      purchaseOrderIds: coverage.purchaseOrders.map((po) => po.purchaseOrderId),
      purchaseRequisitionIds: coverage.purchaseRequisitions.map((pr) => pr.purchaseRequisitionId),
    },
  });

  return {
    alerted: true,
    available: input.availableAfter,
    reorderPoint: item.reorderPoint,
    coverage,
    message,
  };
}

/**
 * Call before changing an item's reorder point. Holding the usable balance lock
 * makes a stock event running at the same time finish first, so the event and
 * the point change cannot both miss the alert. Stock events lock the balance
 * before touching the items row, so this keeps the same lock order.
 */
export async function lockForReorderPointChange(tx: Tx, itemId: number): Promise<void> {
  await lockBalance(tx, itemId, "usable");
}

/**
 * Checks the item again after its reorder point changes (raising it can cross).
 * Run it after `lockForReorderPointChange` in the same transaction.
 */
export async function checkReorderAfterPointChange(
  tx: Tx,
  input: { itemId: number; previousReorderPoint: string },
): Promise<ReorderCheckResult> {
  const available = await findAvailableQuantity(tx, input.itemId);

  return checkReorder(tx, {
    itemId: input.itemId,
    availableBefore: available,
    availableAfter: available,
    previousReorderPoint: input.previousReorderPoint,
  });
}
