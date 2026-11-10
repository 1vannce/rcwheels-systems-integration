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
  insertItem,
  updateItemReorderPoint,
} from "../repositories/item.repository";
import type { ItemStock, StockMovement } from "../types/stock.type";
import { subtractQuantities } from "./quantity.service";
import { openItemBalances } from "./stock.service";

const MOVEMENT_LIST_LIMIT = 200;

// Available = usable on hand minus active reservations.
function withAvailable(item: ItemStock): ItemStock {
  return { ...item, available: subtractQuantities(item.usable, item.reserved) };
}

export async function listItemsWithStock(): Promise<ItemStock[]> {
  return (await findItemsWithStock(db)).map(withAvailable);
}

export async function getItemStockDetail(
  itemId: number,
): Promise<{ item: ItemStock; movements: StockMovement[] } | null> {
  const [item] = await findItemsWithStock(db, itemId);

  if (!item) {
    return null;
  }

  return {
    item: withAvailable(item),
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
