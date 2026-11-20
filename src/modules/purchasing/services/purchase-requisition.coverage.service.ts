import "server-only";

import type { Tx } from "@/db";
import { recordAudit } from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";

import {
  findPurchaseRequisitionCoverage,
  lockPurchaseRequisitionForOrder,
  setPurchaseRequisitionStatus,
} from "../repositories/purchase-requisition.repository";

/**
 * Re-derives a PR's status from its committed PO coverage.
 *
 * A PR line is fully covered once approved (or later) PO quantity reaches its
 * requested quantity. Drafts only reserve quantity to prevent duplicate
 * demand, so a PR with only unapproved drafts stays open. Cancelled PRs are
 * never touched.
 *
 * This runs inside the caller's transaction, so coverage changes commit with
 * the PO event that caused them. Headers are locked in ascending ID order.
 */
export async function refreshPurchaseRequisitionCoverage(
  tx: Tx,
  actorUserId: number,
  purchaseRequisitionIds: readonly number[],
): Promise<void> {
  const ids = [...new Set(purchaseRequisitionIds)].sort((a, b) => a - b);

  for (const purchaseRequisitionId of ids) {
    const header = await lockPurchaseRequisitionForOrder(tx, purchaseRequisitionId);

    if (!header || header.status === "cancelled") {
      continue;
    }

    const coverage = await findPurchaseRequisitionCoverage(tx, purchaseRequisitionId);

    if (coverage.length === 0) {
      continue;
    }

    const fullyCovered = coverage.every(
      (line) => compareQuantities(line.committedQty, line.requestedQty) >= 0,
    );
    const nextStatus = fullyCovered ? "covered" : "open";

    if (header.status === nextStatus) {
      continue;
    }

    await setPurchaseRequisitionStatus(tx, purchaseRequisitionId, nextStatus);

    await recordAudit(tx, {
      actorUserId,
      entityType: "purchase_requisitions",
      entityId: purchaseRequisitionId,
      action:
        nextStatus === "covered"
          ? "purchase_requisition.cover"
          : "purchase_requisition.reopen",
      details: {
        previousStatus: header.status,
        coverage: coverage.map((line) => ({
          purchaseRequisitionLineId: line.purchaseRequisitionLineId,
          requestedQty: line.requestedQty,
          committedQty: line.committedQty,
          draftQty: line.draftQty,
        })),
      },
    });
  }
}
