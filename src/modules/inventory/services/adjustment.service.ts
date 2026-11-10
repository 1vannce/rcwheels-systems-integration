import "server-only";

import { db } from "@/db";
import {
  BlockedActionError,
  notifyRoles,
  notifyUsers,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";

import {
  findAdjustments,
  findBalance,
  hasPendingAdjustment,
  insertAdjustment,
  lockAdjustment,
  updateAdjustmentStatus,
} from "../repositories/adjustment.repository";
import type { StockAdjustment, StockCondition } from "../types/stock.type";
import { applyApprovedAdjustment, openItemBalances } from "./stock.service";

const ADJUSTMENT_LIST_LIMIT = 100;

function blocked(message: string, action: string, adjustmentId: number, details?: unknown) {
  return new BlockedActionError(message, {
    entityType: "stock_adjustments",
    entityId: adjustmentId,
    action: `adjustment.${action}`,
    details,
  });
}

export async function listAdjustments(): Promise<StockAdjustment[]> {
  return findAdjustments(db, ADJUSTMENT_LIST_LIMIT);
}

/**
 * Records a physical count that differs from, or confirms, the system
 * quantity. Stock does not change until an Inventory Manager approves it.
 */
export async function requestAdjustment(
  actor: AppUser,
  input: { itemId: number; condition: StockCondition; countedQty: string; reason: string },
): Promise<{ adjustmentId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    let balance = await findBalance(tx, input.itemId, input.condition);

    if (!balance) {
      // Throws a foreign-key error for an unknown item, which is the right outcome.
      await openItemBalances(tx, input.itemId);
      balance = (await findBalance(tx, input.itemId, input.condition))!;
    }

    if (await hasPendingAdjustment(tx, balance.stockBalanceId)) {
      throw blocked(
        "A count for this balance is already waiting for approval.",
        "request",
        0,
        input,
      );
    }

    const adjustmentId = await insertAdjustment(tx, {
      stockBalanceId: balance.stockBalanceId,
      countedBy: actor.userId,
      recordedQty: balance.quantityOnHand,
      countedQty: input.countedQty,
      reason: input.reason,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "stock_adjustments",
      entityId: adjustmentId,
      action: "adjustment.request",
      details: { ...input, recordedQty: balance.quantityOnHand },
    });
    await notifyRoles(
      tx,
      ["inventory_manager"],
      {
        type: "adjustment.requested",
        message: `${actor.fullName} recorded a stock count that needs your approval.`,
      },
      actor.userId,
    );

    return { adjustmentId };
  });
}

/**
 * Approves a count and posts the stock change in the same transaction. The
 * person who counted cannot approve their own count (rule 11).
 */
export async function approveAdjustment(
  actor: AppUser,
  input: { adjustmentId: number },
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const adjustment = await lockAdjustment(tx, input.adjustmentId);

    if (!adjustment || adjustment.status !== "pending") {
      throw blocked("Only a pending adjustment can be approved.", "approve", input.adjustmentId);
    }

    if (adjustment.countedBy === actor.userId) {
      throw blocked("You cannot approve your own stock count.", "approve", input.adjustmentId);
    }

    await updateAdjustmentStatus(tx, adjustment.adjustmentId, "approved", actor.userId);

    const { quantityDelta } = await applyApprovedAdjustment(tx, input);

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "stock_adjustments",
      entityId: adjustment.adjustmentId,
      action: "adjustment.approve",
      details: { quantityDelta },
    });
    await notifyUsers(tx, [adjustment.countedBy], {
      type: "adjustment.approved",
      message: `${actor.fullName} approved your stock count. The balance was updated.`,
    });
  });
}

export async function rejectAdjustment(
  actor: AppUser,
  input: { adjustmentId: number; reason: string },
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const adjustment = await lockAdjustment(tx, input.adjustmentId);

    if (!adjustment || adjustment.status !== "pending") {
      throw blocked("Only a pending adjustment can be rejected.", "reject", input.adjustmentId);
    }

    await updateAdjustmentStatus(tx, adjustment.adjustmentId, "rejected", null);
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "stock_adjustments",
      entityId: adjustment.adjustmentId,
      action: "adjustment.reject",
      details: { reason: input.reason },
    });
    await notifyUsers(tx, [adjustment.countedBy], {
      type: "adjustment.rejected",
      message: `${actor.fullName} rejected your stock count: ${input.reason}`,
    });
  });
}
