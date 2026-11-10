import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";
import { items, stockAdjustments, stockBalances, users } from "@/db/schema";

import type {
  AdjustmentStatus,
  StockAdjustment,
  StockCondition,
} from "../types/stock.type";

export async function findBalance(tx: Tx, itemId: number, condition: StockCondition) {
  const [row] = await tx
    .select({
      stockBalanceId: stockBalances.stockBalanceId,
      quantityOnHand: stockBalances.quantityOnHand,
    })
    .from(stockBalances)
    .where(and(eq(stockBalances.itemId, itemId), eq(stockBalances.condition, condition)));

  return row ?? null;
}

export async function hasPendingAdjustment(
  tx: Tx,
  stockBalanceId: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ adjustmentId: stockAdjustments.adjustmentId })
    .from(stockAdjustments)
    .where(
      and(
        eq(stockAdjustments.stockBalanceId, stockBalanceId),
        eq(stockAdjustments.status, "pending"),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function insertAdjustment(
  tx: Tx,
  adjustment: {
    stockBalanceId: number;
    countedBy: number;
    recordedQty: string;
    countedQty: string;
    reason: string;
  },
): Promise<number> {
  const [row] = await tx
    .insert(stockAdjustments)
    .values(adjustment)
    .returning({ adjustmentId: stockAdjustments.adjustmentId });

  return row.adjustmentId;
}

/** Reads an adjustment and locks it, so two decisions cannot both go through. */
export async function lockAdjustment(tx: Tx, adjustmentId: number) {
  const [row] = await tx
    .select({
      adjustmentId: stockAdjustments.adjustmentId,
      countedBy: stockAdjustments.countedBy,
      status: stockAdjustments.status,
    })
    .from(stockAdjustments)
    .where(eq(stockAdjustments.adjustmentId, adjustmentId))
    .for("update");

  return row ?? null;
}

export async function updateAdjustmentStatus(
  tx: Tx,
  adjustmentId: number,
  status: AdjustmentStatus,
  approvedBy: number | null,
): Promise<void> {
  await tx
    .update(stockAdjustments)
    .set({ status, approvedBy })
    .where(eq(stockAdjustments.adjustmentId, adjustmentId));
}

export async function findAdjustments(tx: Tx, limit: number): Promise<StockAdjustment[]> {
  const counters = alias(users, "counters");
  const approvers = alias(users, "approvers");

  return tx
    .select({
      adjustmentId: stockAdjustments.adjustmentId,
      itemId: items.itemId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      condition: stockBalances.condition,
      recordedQty: stockAdjustments.recordedQty,
      countedQty: stockAdjustments.countedQty,
      reason: stockAdjustments.reason,
      status: stockAdjustments.status,
      countedAt: stockAdjustments.countedAt,
      countedById: stockAdjustments.countedBy,
      countedByName: counters.fullName,
      approvedByName: approvers.fullName,
    })
    .from(stockAdjustments)
    .innerJoin(
      stockBalances,
      eq(stockBalances.stockBalanceId, stockAdjustments.stockBalanceId),
    )
    .innerJoin(items, eq(items.itemId, stockBalances.itemId))
    .innerJoin(counters, eq(counters.userId, stockAdjustments.countedBy))
    .leftJoin(approvers, eq(approvers.userId, stockAdjustments.approvedBy))
    .orderBy(desc(stockAdjustments.adjustmentId))
    .limit(limit);
}
