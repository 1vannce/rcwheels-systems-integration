"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { MarkAwaitingStockDto } from "../schemas/requisition.dto";
import { markAwaitingStockService } from "../services/requisition.mark-awaiting-stock.service";
import { textField } from "./utils/requisition-action.form-data.util";

/**
 * Records the stock check when nothing can be reserved. The request moves to
 * Awaiting Stock so a purchase request can be raised for the uncovered need.
 */
export async function markAwaitingStockAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["inventory_custodian"], "requisition.mark-awaiting-stock");
    const parsed = MarkAwaitingStockDto.safeParse({ requisitionId });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await markAwaitingStockService(user, parsed.data.requisitionId);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/issue-queue");
  revalidatePath(`/requisitions/${requisitionId}`);

  return { ok: true, message: "No stock available. The request is now awaiting stock." };
}
