import "server-only";

import { db } from "@/db";
import type { AppUser } from "@/modules/core";

import { findPurchaseOrderById } from "../repositories/purchase-order.repository";
import { findPurchaseRequisitionSummary } from "../repositories/purchase-requisition.repository";
import { findSupplierById } from "../repositories/supplier.repository";
import type { PurchaseOrderReviewContextDto } from "../types/purchasing.dto";
import { diffPurchaseOrderSnapshots } from "../utils/purchase-order-snapshot-diff.util";
import { tryParsePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";

/**
 * Accounting's read model for one PO: header, lines, revisions, supplier,
 * source PR, and the change from the previous version. Returning null for
 * another role keeps the server check in one place.
 */
export async function getPurchaseOrderReviewContextService(
  actor: AppUser,
  purchaseOrderId: number,
): Promise<PurchaseOrderReviewContextDto | null> {
  if (
    actor.role !== "accounting_associate" &&
    actor.role !== "system_administrator"
  ) {
    return null;
  }

  const order = await findPurchaseOrderById(db, purchaseOrderId);

  if (!order) {
    return null;
  }

  const purchaseRequisitionId =
    order.lines.find((line) => line.purchaseRequisitionId !== null)
      ?.purchaseRequisitionId ?? null;
  const [supplier, sourcePurchaseRequisition] = await Promise.all([
    findSupplierById(db, order.supplierId),
    purchaseRequisitionId === null
      ? Promise.resolve(null)
      : findPurchaseRequisitionSummary(db, purchaseRequisitionId),
  ]);

  const currentRevision =
    order.revisions.find(
      (revision) => revision.versionNo === order.currentVersion,
    ) ?? null;
  const previousRevision =
    order.revisions.find(
      (revision) => revision.versionNo === order.currentVersion - 1,
    ) ?? null;

  const currentSnapshot = currentRevision
    ? tryParsePurchaseOrderSnapshot(currentRevision.snapshot)
    : null;
  const previousSnapshot = previousRevision
    ? tryParsePurchaseOrderSnapshot(previousRevision.snapshot)
    : null;

  return {
    order,
    supplier,
    sourcePurchaseRequisition,
    versionDiff:
      currentSnapshot && previousSnapshot
        ? diffPurchaseOrderSnapshots(previousSnapshot, currentSnapshot)
        : null,
    snapshotUnavailable: !currentSnapshot,
  };
}
