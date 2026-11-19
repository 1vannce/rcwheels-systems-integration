"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { CreatePurchaseOrderDto } from "../schemas/purchase-order.dto";
import { createPurchaseOrderService } from "../services/purchase-order.create.service";
import { formatPoNumber } from "../utils/po-number.util";
import { readLines, textField } from "./utils/purchasing-action.form-data.util";

/**
 * Creates a pending PO draft from an open purchase request. The action
 * authenticates the Purchasing Staff, parses the whole form with the DTO, and
 * calls exactly one service.
 */
export async function createPurchaseOrderAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const purchaseRequisitionId = textField(formData, "purchaseRequisitionId");
  const deliveryTerms = textField(formData, "deliveryTerms");
  let message: string;

  try {
    const user = await requireRole(
      ["purchasing_staff"],
      "purchase_order.create",
    );

    const parsed = CreatePurchaseOrderDto.safeParse({
      purchaseRequisitionId,
      supplierId: textField(formData, "supplierId"),
      deliveryTerms: deliveryTerms || undefined,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const { purchaseOrderId } = await createPurchaseOrderService(
      user,
      parsed.data,
    );

    message = `Purchase order ${formatPoNumber(purchaseOrderId)} created and sent to Accounting.`;
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/purchasing/orders");
  revalidatePath("/purchasing/requisitions");

  return { ok: true, message };
}
