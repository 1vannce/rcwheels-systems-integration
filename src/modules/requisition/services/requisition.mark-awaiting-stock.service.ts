import "server-only";

import { notifyRoles, recordAudit, runBusinessEvent, type AppUser } from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";

import {
  findRequisitionLines,
  insertRequisitionStatusHistory,
  lockRequisition,
  updateRequisitionStatus,
} from "../repositories/requisition.repository";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";

/**
 * Records a stock check where no line can be reserved, moving the request to
 * Awaiting Stock without creating an empty reservation.
 *
 * The normal reserve path handles partial stock. This covers the all-zero
 * branch, which otherwise leaves an approved request stuck because the reserve
 * form refuses to submit with no positive quantity.
 */
export async function markAwaitingStockService(
  actor: AppUser,
  requisitionId: number,
): Promise<{ requisitionId: number; status: "awaiting_stock" }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockRequisition(tx, requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.mark-awaiting-stock", {
        requisitionId,
      });
    }

    if (locked.status !== "approved") {
      throw blocked(
        "Only an approved request can be marked as awaiting stock.",
        "requisition.mark-awaiting-stock",
        { requisitionId, status: locked.status },
      );
    }

    const lines = await findRequisitionLines(tx, requisitionId);
    const hasReservableStock = lines.some(
      (line) =>
        compareQuantities(line.reservableQty, "0") > 0 &&
        compareQuantities(line.availableStock, "0") > 0,
    );

    if (hasReservableStock) {
      throw blocked(
        "Some stock is still available. Reserve what is available before marking the request as awaiting stock.",
        "requisition.mark-awaiting-stock",
        { requisitionId },
      );
    }

    await updateRequisitionStatus(tx, requisitionId, "awaiting_stock");
    await insertRequisitionStatusHistory(tx, {
      requisitionId,
      changedBy: actor.userId,
      fromStatus: "approved",
      toStatus: "awaiting_stock",
      reason: "No stock available",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: requisitionId,
      action: "requisition.mark-awaiting-stock",
      details: {
        lines: lines.map((line) => ({
          requisitionLineId: line.requisitionLineId,
          itemId: line.itemId,
          reservableQty: line.reservableQty,
          availableStock: line.availableStock,
        })),
      },
    });

    await notifyRoles(
      tx,
      ["inventory_manager"],
      {
        type: "requisition_awaiting_stock",
        message: `Request #${requisitionId} has no stock available and is awaiting stock.`,
        requisitionId,
      },
      actor.userId,
    );

    return { requisitionId, status: "awaiting_stock" };
  });
}
