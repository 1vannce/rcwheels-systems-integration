"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { PlacePurchaseOrderDto } from "../schemas/purchase-order.dto";
import { placePurchaseOrderService } from "../services/purchase-order.place.service";
import { formatPoNumber } from "../utils/po-number.util";
import { textField } from "./utils/purchasing-action.form-data.util";

/** Purchasing Staff place an approved PO and hand it to Supplier Receiving. */
export async function placePurchaseOrderAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const purchaseOrderId = textField(formData, "purchaseOrderId");

  try {
    const user = await requireRole(["purchasing_staff"], "purchase_order.place");
    const parsed = PlacePurchaseOrderDto.safeParse({ purchaseOrderId });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await placePurchaseOrderService(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/orders");
  revalidatePath(`/purchasing/orders/${purchaseOrderId}`);
  revalidatePath("/purchasing/accounting-review");
  revalidatePath("/delivery/receiving");

  return {
    ok: true,
    message: `${formatPoNumber(Number(purchaseOrderId))} placed and sent to Supplier Receiving.`,
  };
}
