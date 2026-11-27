import "server-only";

import { db } from "@/db";
import { type AppUser } from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";

import {
  findOpenPurchaseRequisitionLinesForOrder,
  findPurchaseOrderById,
  findPurchaseOrders,
  findPurchaseRequisitionLinesForOrder,
  isPurchaseOrderCurrentVersionApproved,
} from "../repositories/purchase-order.repository";
import { findPurchaseRequisitionSummary } from "../repositories/purchase-requisition.repository";
import { findSuppliers } from "../repositories/supplier.repository";
import type {
  PurchaseOrderDto,
  PurchaseOrderEditContextDto,
  PurchaseOrderFormContextDto,
} from "../types/purchasing.dto";

const OPEN_PURCHASE_ORDER_STATUSES = [
  "pending_approval",
  "for_revision",
  "approved",
  "placed",
  "partially_received",
] as const;

/** POs whose commitments are still open after Accounting approval. */
const OPEN_COMMITMENT_PURCHASE_ORDER_STATUSES = [
  "approved",
  "placed",
  "partially_received",
] as const;

const PURCHASE_ORDER_LIST_LIMIT = 100;

/** Active POs for the Purchasing Staff list, newest first. */
export async function listPurchaseOrdersService(
  actor: AppUser,
): Promise<PurchaseOrderDto[]> {
  if (actor.role !== "purchasing_staff") {
    return [];
  }

  return findPurchaseOrders(db, {
    statuses: OPEN_PURCHASE_ORDER_STATUSES,
    limit: PURCHASE_ORDER_LIST_LIMIT,
  });
}

/** POs waiting for Accounting's budget decision. */
export async function listPendingPurchaseOrdersService(
  actor: AppUser,
): Promise<PurchaseOrderDto[]> {
  if (actor.role !== "accounting_associate" && actor.role !== "system_administrator") {
    return [];
  }

  return findPurchaseOrders(db, {
    statuses: ["pending_approval"],
    limit: PURCHASE_ORDER_LIST_LIMIT,
  });
}

/**
 * Approved, placed, and partially received POs for the open PO follow-up.
 * Accounting uses it to see committed and outstanding value; Purchasing Staff
 * use it to follow up deliveries.
 */
export async function listOpenPurchaseOrdersService(
  actor: AppUser,
): Promise<PurchaseOrderDto[]> {
  if (
    actor.role !== "purchasing_staff" &&
    actor.role !== "accounting_associate" &&
    actor.role !== "system_administrator"
  ) {
    return [];
  }

  return findPurchaseOrders(db, {
    statuses: OPEN_COMMITMENT_PURCHASE_ORDER_STATUSES,
    limit: PURCHASE_ORDER_LIST_LIMIT,
  });
}

/**
 * Connector E handoff: placed POs waiting in the Supplier Receiving queue.
 * This only reads the queue; it never posts stock.
 */
export async function listPurchaseOrdersForReceivingService(
  actor: AppUser,
): Promise<PurchaseOrderDto[]> {
  if (
    actor.role !== "inventory_custodian" &&
    actor.role !== "delivery_operations" &&
    actor.role !== "system_administrator"
  ) {
    return [];
  }

  return findPurchaseOrders(db, {
    statuses: ["placed", "partially_received"],
    limit: PURCHASE_ORDER_LIST_LIMIT,
  });
}

/**
 * The source PR, remaining PR lines, and supplier choices for preparing a PO.
 * Returns null when the PR is missing, closed, or not available to this role.
 */
export async function getPurchaseOrderFormContextService(
  actor: AppUser,
  purchaseRequisitionId: number,
): Promise<PurchaseOrderFormContextDto | null> {
  if (actor.role !== "purchasing_staff") {
    return null;
  }

  const [summary, lines, suppliers] = await Promise.all([
    findPurchaseRequisitionSummary(db, purchaseRequisitionId),
    findOpenPurchaseRequisitionLinesForOrder(db, purchaseRequisitionId),
    findSuppliers(db),
  ]);

  if (!summary || summary.status !== "open") {
    return null;
  }

  return {
    purchaseRequisition: summary,
    lines: lines.filter((line) => compareQuantities(line.remainingQty, "0") > 0),
    suppliers,
  };
}

/**
 * The stored PO, its source quantities excluding its own allocation, and the
 * suppliers available for a revision.
 */
export async function getPurchaseOrderEditContextService(
  actor: AppUser,
  purchaseOrderId: number,
): Promise<PurchaseOrderEditContextDto | null> {
  if (actor.role !== "purchasing_staff") {
    return null;
  }

  const order = await findPurchaseOrderById(db, purchaseOrderId);

  if (!order) {
    return null;
  }

  const purchaseRequisitionId =
    order.lines.find((line) => line.purchaseRequisitionId !== null)
      ?.purchaseRequisitionId ?? null;
  const [sourceLines, suppliers] = await Promise.all([
    purchaseRequisitionId === null
      ? Promise.resolve([])
      : findPurchaseRequisitionLinesForOrder(db, purchaseRequisitionId, {
          excludePurchaseOrderId: purchaseOrderId,
          requireOpen: false,
        }),
    findSuppliers(db),
  ]);

  const canPlace = await isPurchaseOrderCurrentVersionApproved(db, purchaseOrderId);

  return {
    order,
    sourceLines,
    suppliers,
    canEdit: order.status === "for_revision" || order.status === "approved",
    canPlace,
    canDiscard:
      order.status === "pending_approval" || order.status === "for_revision",
  };
}
