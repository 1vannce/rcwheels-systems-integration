"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { ApprovePurchaseOrderDto } from "../schemas/purchase-order.dto";
import { approvePurchaseOrderService } from "../services/purchase-order.review.service";
import { textField } from "./utils/purchasing-action.form-data.util";

/** Accounting approves the current PO version. */
export async function approvePurchaseOrderAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["accounting_associate"], "purchase_order.approve");
    const parsed = ApprovePurchaseOrderDto.safeParse({
      purchaseOrderId: textField(formData, "purchaseOrderId"),
      reason: textField(formData, "reason"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await approvePurchaseOrderService(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/accounting-review");
  revalidatePath("/purchasing/orders");
  revalidatePath("/purchasing/orders/[purchaseOrderId]", "page");
  revalidatePath("/purchasing/requisitions");

  return { ok: true, message: "Purchase order approved." };
}
