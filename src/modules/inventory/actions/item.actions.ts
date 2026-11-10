"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { createItemSchema, updateReorderPointSchema } from "../schemas/inventory.schema";
import { createItem, updateReorderPoint } from "../services/item.service";

export async function createItemAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(
      ["inventory_custodian", "inventory_manager"],
      "item.create",
    );
    const parsed = createItemSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await createItem(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/items");

  return { ok: true, message: "Item added." };
}

export async function updateReorderPointAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let itemId: number;

  try {
    const user = await requireRole(["inventory_manager"], "item.update-reorder-point");
    const parsed = updateReorderPointSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    itemId = parsed.data.itemId;
    await updateReorderPoint(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/items");
  revalidatePath(`/inventory/items/${itemId}`);

  return { ok: true, message: "Reorder point saved." };
}
