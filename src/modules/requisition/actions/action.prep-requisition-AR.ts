"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField, readLines } from "./utils/requisition-action.form-data.util";
import { PrepareAcknowledgementReceiptDto } from "../schemas/requisition.dto";
import { 
    prepareAcknowledgementReceiptService as prepareAcknowledgementReceipt 
} from "../services/requisition.prep-AR.service";

/**
 * Prepares the dispatch and acknowledgement receipt for a reserved request.
 * Stock is not deducted here; the dispatch posts it once when released.
 */
export async function prepareAcknowledgementReceiptAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["inventory_custodian"], "requisition.prepare-ar");

    const parsed = PrepareAcknowledgementReceiptDto.safeParse({
      requisitionId,
      deliveryPersonnel: textField(formData, "deliveryPersonnel"),
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await prepareAcknowledgementReceipt(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/ar-preparation");
  revalidatePath(`/requisitions/${requisitionId}`);

  return {
    ok: true,
    message: "Acknowledgement receipt prepared; the request is now For Delivery.",
  };
}