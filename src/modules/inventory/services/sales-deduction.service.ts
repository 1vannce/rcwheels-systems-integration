import "server-only";

import { db } from "@/db";
import { notifyRoles, recordAudit, runBusinessEvent, type AppUser } from "@/modules/core";

import { findSalesDeductions } from "../repositories/item.repository";
import type { SalesDeduction } from "../types/stock.type";
import { deductSales, reverseSalesDeduction as postSalesReversal } from "./stock.service";

const SALES_LIST_LIMIT = 100;

const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });

/** Today's date at the main location, as YYYY-MM-DD. */
export function todayInManila(now: Date = new Date()): string {
  return manilaDate.format(now);
}

export async function listSalesDeductions(): Promise<SalesDeduction[]> {
  return findSalesDeductions(db, SALES_LIST_LIMIT);
}

/**
 * Deducts sold stock against a sales record. The same record line cannot be
 * posted twice. A sale entered after its sale date flags the balance
 * incomplete and tells the Inventory Manager and Custodians.
 */
export async function recordSalesDeduction(
  actor: AppUser,
  input: { itemId: number; quantity: string; salesRef: string; saleDate: string },
  now: Date = new Date(),
): Promise<{ movementId: number; isLate: boolean }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const result = await deductSales(tx, { ...input, entryDate: todayInManila(now) });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "stock_movements",
      entityId: result.movementId,
      action: "sales-deduction.record",
      details: { ...input, isLate: result.isLate },
    });

    if (result.isLate) {
      await notifyRoles(
        tx,
        ["inventory_manager", "inventory_custodian"],
        {
          type: "stock.incomplete",
          message: `A late sales entry (${input.salesRef}, sold ${input.saleDate}) flagged a balance incomplete. Verify it with a physical count.`,
        },
        actor.userId,
      );
    }

    return result;
  });
}

/** Corrects a wrong sales deduction with a linked reversal; nothing is edited. */
export async function reverseSalesDeduction(
  actor: AppUser,
  input: { movementId: number; reason: string },
): Promise<{ movementId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const result = await postSalesReversal(tx, { movementId: input.movementId });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "stock_movements",
      entityId: result.movementId,
      action: "sales-deduction.reverse",
      details: { reverses: input.movementId, reason: input.reason },
    });

    return result;
  });
}
