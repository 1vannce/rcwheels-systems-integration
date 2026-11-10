"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import {
  approveAdjustmentSchema,
  rejectAdjustmentSchema,
  requestAdjustmentSchema,
} from "../schemas/inventory.schema";
import {
  approveAdjustment,
  rejectAdjustment,
  requestAdjustment,
} from "../services/adjustment.service";

export async function requestAdjustmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["inventory_custodian"], "adjustment.request");
    const parsed = requestAdjustmentSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await requestAdjustment(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/adjustments");

  return { ok: true, message: "Count recorded. It is waiting for manager approval." };
}

// One form carries both decisions; the button pressed says which.
export async function decideAdjustmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const approve = formData.get("decision") === "approve";

  try {
    const user = await requireRole(
      ["inventory_manager"],
      approve ? "adjustment.approve" : "adjustment.reject",
    );

    if (approve) {
      const parsed = approveAdjustmentSchema.safeParse(Object.fromEntries(formData));

      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0].message };
      }

      await approveAdjustment(user, parsed.data);
    } else {
      const parsed = rejectAdjustmentSchema.safeParse(Object.fromEntries(formData));

      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues[0].message };
      }

      await rejectAdjustment(user, parsed.data);
    }
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/items");

  return { ok: true, message: approve ? "Approved. Stock updated." : "Rejected." };
}
