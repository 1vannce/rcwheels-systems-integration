"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { DiscardPurchaseOrderDraftDto } from "../schemas/purchase-order.dto";
import { discardPurchaseOrderDraftService } from "../services/purchase-order.discard.service";
import { formatPoNumber } from "../utils/po-number.util";
import { textField } from "./utils/purchasing-action.form-data.util";

/** Purchasing Staff withdraw an unapproved PO draft. */
export async function discardPurchaseOrderDraftAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const purchaseOrderId = textField(formData, "purchaseOrderId");
  let message: string;

  try {
    const user = await requireRole(["purchasing_staff"], "purchase_order.discard");
    const parsed = DiscardPurchaseOrderDraftDto.safeParse({ purchaseOrderId });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await discardPurchaseOrderDraftService(user, parsed.data);

    message = `${formatPoNumber(parsed.data.purchaseOrderId)} discarded and its quantity released.`;
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/orders");
  revalidatePath(`/purchasing/orders/${purchaseOrderId}`);
  revalidatePath("/purchasing/requisitions");
  revalidatePath("/purchasing/accounting-review");

  return { ok: true, message };
}
