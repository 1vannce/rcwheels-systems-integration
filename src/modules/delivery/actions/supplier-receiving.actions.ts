"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { ReceiveSupplierDeliverySchema } from "../schemas/delivery.schema";
import { receiveSupplierDelivery } from "../services/supplier-receiving.service";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/** The JSON line list a form keeps in a hidden field; malformed input becomes []. */
function lines(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, "lines") || "[]");
  } catch {
    return [];
  }
}

/**
 * Records and inspects a supplier delivery against a placed PO. Recording
 * accept or reject is the Custodian's inspection, so only the Custodian may
 * call it (BR-SR-03).
 */
export async function receiveSupplierDeliveryAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let outcome: "closed" | "accepted" | "nothing-accepted" = "accepted";

  try {
    const user = await requireRole(["inventory_custodian"], "supplier_receipt.receive");
    const parsed = ReceiveSupplierDeliverySchema.safeParse({
      purchaseOrderId: text(formData, "purchaseOrderId"),
      deliveryReceiptNo: text(formData, "deliveryReceiptNo"),
      invoiceNo: text(formData, "invoiceNo"),
      lines: lines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const result = await receiveSupplierDelivery(user, parsed.data);

    outcome =
      result.movementIds.length === 0
        ? "nothing-accepted"
        : result.purchaseOrderStatus === "closed"
          ? "closed"
          : "accepted";
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/delivery", "layout");
  revalidatePath("/purchasing", "layout");

  return {
    ok: true,
    message: {
      closed: "Delivery received. The purchase order is fully received and closed.",
      accepted: "Delivery received. Accepted items were added to stock.",
      "nothing-accepted": "Delivery recorded. Nothing was accepted, so no stock was added.",
    }[outcome],
  };
}
