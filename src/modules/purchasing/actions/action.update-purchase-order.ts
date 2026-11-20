"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { UpdatePurchaseOrderDto } from "../schemas/purchase-order.dto";
import { updatePurchaseOrderService } from "../services/purchase-order.update.service";
import { formatPoNumber } from "../utils/po-number.util";
import { readLines, textField } from "./utils/purchasing-action.form-data.util";

/**
 * Saves a revised PO version. Any change resets the PO to Pending Approval and
 * requires Accounting to review the new version.
 */
export async function updatePurchaseOrderAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const purchaseOrderId = textField(formData, "purchaseOrderId");
  const deliveryTerms = textField(formData, "deliveryTerms");
  let message: string;

  try {
    const user = await requireRole(["purchasing_staff"], "purchase_order.revise");
    const parsed = UpdatePurchaseOrderDto.safeParse({
      purchaseOrderId,
      supplierId: textField(formData, "supplierId"),
      deliveryTerms: deliveryTerms || undefined,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const result = await updatePurchaseOrderService(user, parsed.data);

    message = `${formatPoNumber(result.purchaseOrderId)} version ${result.versionNo} saved and sent to Accounting.`;
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/orders");
  revalidatePath(`/purchasing/orders/${purchaseOrderId}`);
  revalidatePath("/purchasing/accounting-review");

  return { ok: true, message };
}
