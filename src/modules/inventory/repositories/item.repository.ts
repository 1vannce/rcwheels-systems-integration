import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Tx } from "@/db";
import { items, stockBalances, stockMovements, stockReservations } from "@/db/schema";

import type {
  ItemStockRecord,
  ItemStockReservation,
  SalesDeduction,
  StockMovement,
} from "../types/stock.type";

/**
 * Every item with its stock figures, or one item when `itemId` is given.
 * Reserved, in transit, and available are worked out here, never stored.
 */
export async function findItemsWithStock(
  tx: Tx,
  itemId?: number,
): Promise<ItemStockRecord[]> {
  const rows = await tx.execute<{
    item_id: number;
    item_code: string;
    item_name: string;
    specification: string;
    unit: string;
    reorder_point: string;
    average_cost: string;
    usable: string;
    in_transit: string;
    held: string;
    damaged: string;
    is_incomplete: boolean;
  }>(sql`
    select
      i.item_id, i.item_code, i.item_name, i.specification, i.unit,
      i.reorder_point, i.average_cost,
      coalesce(max(b.quantity_on_hand) filter (where b.condition = 'usable'), 0)::numeric(14, 3) as usable,
      coalesce(max(b.quantity_on_hand) filter (where b.condition = 'hold'), 0)::numeric(14, 3) as held,
      coalesce(max(b.quantity_on_hand) filter (where b.condition = 'damaged'), 0)::numeric(14, 3) as damaged,
      coalesce(bool_or(b.is_incomplete), false) as is_incomplete,
      coalesce((
        select sum(dl.sent_qty - dl.accepted_qty - coalesce((
          select sum(rl.returned_qty) from return_lines rl
          where rl.dispatch_line_id = dl.dispatch_line_id
        ), 0))
        from dispatch_lines dl
        join dispatches d on d.dispatch_id = dl.dispatch_id
        join requisition_lines ql on ql.requisition_line_id = dl.requisition_line_id
        -- A prepared AR is not in transit until it is dispatched.
        where ql.item_id = i.item_id and d.status = 'dispatched'
      ), 0)::numeric(14, 3) as in_transit
    from items i
    left join stock_balances b on b.item_id = i.item_id
    ${itemId === undefined ? sql`` : sql`where i.item_id = ${itemId}`}
    group by i.item_id
    order by i.item_code
  `);

  return rows.map((row) => ({
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    specification: row.specification,
    unit: row.unit,
    reorderPoint: row.reorder_point,
    averageCost: row.average_cost,
    usable: row.usable,
    inTransit: row.in_transit,
    held: row.held,
    damaged: row.damaged,
    isIncomplete: row.is_incomplete,
  }));
}

export async function findStockReservations(
  tx: Tx,
  itemId?: number,
): Promise<ItemStockReservation[]> {
  return tx
    .select({
      itemId: stockBalances.itemId,
      reservedQty: stockReservations.reservedQty,
      status: stockReservations.status,
    })
    .from(stockReservations)
    .innerJoin(
      stockBalances,
      eq(stockBalances.stockBalanceId, stockReservations.stockBalanceId),
    )
    .where(itemId === undefined ? sql`true` : eq(stockBalances.itemId, itemId));
}

export async function findItemByCode(tx: Tx, itemCode: string) {
  const [row] = await tx
    .select({ itemId: items.itemId })
    .from(items)
    .where(eq(items.itemCode, itemCode));

  return row ?? null;
}

export async function insertItem(
  tx: Tx,
  item: {
    itemCode: string;
    itemName: string;
    specification: string;
    unit: string;
    reorderPoint: string;
  },
): Promise<number> {
  const [row] = await tx.insert(items).values(item).returning({ itemId: items.itemId });

  return row.itemId;
}

/** Returns the previous reorder point, or null when the item does not exist. */
export async function updateItemReorderPoint(
  tx: Tx,
  itemId: number,
  reorderPoint: string,
): Promise<string | null> {
  const [current] = await tx
    .select({ reorderPoint: items.reorderPoint })
    .from(items)
    .where(eq(items.itemId, itemId))
    .for("update");

  if (!current) {
    return null;
  }

  await tx.update(items).set({ reorderPoint }).where(eq(items.itemId, itemId));

  return current.reorderPoint;
}

export async function findMovementsByItem(
  tx: Tx,
  itemId: number,
  limit: number,
): Promise<StockMovement[]> {
  return tx
    .select({
      movementId: stockMovements.movementId,
      movementType: stockMovements.movementType,
      condition: stockBalances.condition,
      quantityDelta: stockMovements.quantityDelta,
      unitCost: stockMovements.unitCost,
      eventKey: stockMovements.eventKey,
      postedAt: stockMovements.postedAt,
      reversesMovementId: stockMovements.reversesMovementId,
    })
    .from(stockMovements)
    .innerJoin(stockBalances, eq(stockBalances.stockBalanceId, stockMovements.stockBalanceId))
    .where(eq(stockBalances.itemId, itemId))
    .orderBy(desc(stockMovements.movementId))
    .limit(limit);
}

export async function findSalesDeductions(tx: Tx, limit: number): Promise<SalesDeduction[]> {
  const reversals = alias(stockMovements, "reversals");

  return tx
    .select({
      movementId: stockMovements.movementId,
      itemId: items.itemId,
      itemCode: items.itemCode,
      itemName: items.itemName,
      unit: items.unit,
      quantity: sql<string>`(-${stockMovements.quantityDelta})::numeric(14, 3)`,
      eventKey: stockMovements.eventKey,
      postedAt: stockMovements.postedAt,
      reversedByMovementId: reversals.movementId,
    })
    .from(stockMovements)
    .innerJoin(stockBalances, eq(stockBalances.stockBalanceId, stockMovements.stockBalanceId))
    .innerJoin(items, eq(items.itemId, stockBalances.itemId))
    .leftJoin(reversals, eq(reversals.reversesMovementId, stockMovements.movementId))
    .where(eq(stockMovements.movementType, "sales_deduction"))
    .orderBy(desc(stockMovements.movementId))
    .limit(limit);
}
