"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { CancelPurchaseOrderBalanceDto } from "../schemas/purchase-order.dto";
import { cancelPurchaseOrderBalanceService } from "../services/purchase-order.cancel.service";
import { textField } from "./utils/purchasing-action.form-data.util";

/** Accounting cancels the remaining balance of an approved or placed PO. */
export async function cancelPurchaseOrderBalanceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let purchaseOrderId: number | null = null;

  try {
    const user = await requireRole(
      ["accounting_associate"],
      "purchase_order.cancel_balance",
    );
    const parsed = CancelPurchaseOrderBalanceDto.safeParse({
      purchaseOrderId: textField(formData, "purchaseOrderId"),
      reason: textField(formData, "reason"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    purchaseOrderId = parsed.data.purchaseOrderId;
    await cancelPurchaseOrderBalanceService(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/accounting-review");
  if (purchaseOrderId !== null) {
    revalidatePath(`/purchasing/accounting-review/${purchaseOrderId}`);
  }
  if (purchaseOrderId !== null) {
    revalidatePath(`/purchasing/orders/${purchaseOrderId}`);
  }
  revalidatePath("/purchasing/open-orders");
  revalidatePath("/purchasing/orders");
  revalidatePath("/purchasing/requisitions");

  return { ok: true, message: "Purchase order balance cancelled." };
}
