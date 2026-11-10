"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import {
  recordSalesDeductionSchema,
  reverseSalesDeductionSchema,
} from "../schemas/inventory.schema";
import {
  recordSalesDeduction,
  reverseSalesDeduction,
} from "../services/sales-deduction.service";

export async function recordSalesDeductionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let isLate: boolean;

  try {
    const user = await requireRole(["inventory_custodian"], "sales-deduction.record");
    const parsed = recordSalesDeductionSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    ({ isLate } = await recordSalesDeduction(user, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/sales-deductions");
  revalidatePath("/inventory/items");

  return {
    ok: true,
    message: isLate
      ? "Deducted. This was a late entry, so the balance is flagged incomplete until a count is approved."
      : "Deducted.",
  };
}

export async function reverseSalesDeductionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["inventory_custodian"], "sales-deduction.reverse");
    const parsed = reverseSalesDeductionSchema.safeParse(Object.fromEntries(formData));

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await reverseSalesDeduction(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/sales-deductions");
  revalidatePath("/inventory/items");

  return { ok: true, message: "Reversed." };
}
