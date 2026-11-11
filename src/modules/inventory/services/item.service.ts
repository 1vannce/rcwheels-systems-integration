import "server-only";

import { db } from "@/db";
import {
  BlockedActionError,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";

import {
  findItemByCode,
  findItemsWithStock,
  findMovementsByItem,
  findStockReservations,
  insertItem,
  updateItemReorderPoint,
} from "../repositories/item.repository";
import type {
  ItemStock,
  ItemStockRecord,
  ItemStockReservation,
  StockMovement,
} from "../types/stock.type";
import { addQuantities, subtractQuantities } from "./quantity.service";
import { openItemBalances } from "./stock.service";

const MOVEMENT_LIST_LIMIT = 200;
const ZERO = "0.000";

export function calculateItemAvailability(
  usableOnHand: string,
  reservations: readonly Pick<ItemStockReservation, "reservedQty" | "status">[],
): { reserved: string; available: string } {
  const reserved = reservations.reduce(
    (total, reservation) =>
      reservation.status === "active"
        ? addQuantities(total, reservation.reservedQty)
        : total,
    ZERO,
  );

  return { reserved, available: subtractQuantities(usableOnHand, reserved) };
}

async function listItemsWithAvailability(tx: typeof db, itemId?: number): Promise<ItemStock[]> {
  const [items, reservations] = await Promise.all([
    findItemsWithStock(tx, itemId),
    findStockReservations(tx, itemId),
  ]);
  const reservationsByItem = new Map<number, ItemStockReservation[]>();

  for (const reservation of reservations) {
    const itemReservations = reservationsByItem.get(reservation.itemId) ?? [];
    itemReservations.push(reservation);
    reservationsByItem.set(reservation.itemId, itemReservations);
  }

  return items.map((item: ItemStockRecord) => ({
    ...item,
    ...calculateItemAvailability(
      item.usable,
      reservationsByItem.get(item.itemId) ?? [],
    ),
  }));
}

export async function listItemsWithStock(): Promise<ItemStock[]> {
  return listItemsWithAvailability(db);
}

export async function getItemStockDetail(
  itemId: number,
): Promise<{ item: ItemStock; movements: StockMovement[] } | null> {
  const [item] = await listItemsWithAvailability(db, itemId);

  if (!item) {
    return null;
  }

  return {
    item,
    movements: await findMovementsByItem(db, itemId, MOVEMENT_LIST_LIMIT),
  };
}

export async function createItem(
  actor: AppUser,
  input: {
    itemCode: string;
    itemName: string;
    specification: string;
    unit: string;
    reorderPoint: string;
  },
): Promise<{ itemId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    if (await findItemByCode(tx, input.itemCode)) {
      throw new BlockedActionError(`Item code ${input.itemCode} is already in use.`, {
        entityType: "items",
        entityId: 0,
        action: "item.create",
        details: { itemCode: input.itemCode },
      });
    }

    const itemId = await insertItem(tx, input);

    await openItemBalances(tx, itemId);
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "items",
      entityId: itemId,
      action: "item.create",
      details: input,
    });

    return { itemId };
  });
}

/**
 * Sets the level at which the item is reviewed for reorder. It triggers a
 * review only and never authorizes a purchase (rule 1).
 */
export async function updateReorderPoint(
  actor: AppUser,
  input: { itemId: number; reorderPoint: string },
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const previous = await updateItemReorderPoint(tx, input.itemId, input.reorderPoint);

    if (previous === null) {
      throw new BlockedActionError("The item does not exist.", {
        entityType: "items",
        entityId: input.itemId,
        action: "item.update-reorder-point",
      });
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "items",
      entityId: input.itemId,
      action: "item.update-reorder-point",
      details: { from: previous, to: input.reorderPoint },
    });
  });
}
