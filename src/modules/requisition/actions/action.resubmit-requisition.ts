"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField, readLines } from "./utils/requisition-action.form-data.util";
import { ResubmitRequisitionDto } from "../schemas/requisition.dto";
import { 
    resubmitRequisitionService as resubmitRequisition 
} from "../services/requisition.resubmit.service";

/**
 * Corrects and resubmits a rejected request from the detail screen. The
 * service checks ownership and that the request is still rejected, then routes
 * it back to the same approver.
 */
export async function resubmitRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["requester"], "requisition.resubmit");

    const parsed = ResubmitRequisitionDto.safeParse({
      requisitionId,
      requestedForUserId: textField(formData, "requestedForUserId"),
      purpose: textField(formData, "purpose"),
      deliveryDate: textField(formData, "deliveryDate"),
      deliveryLocation: textField(formData, "deliveryLocation"),
      isUrgent: formData.get("isUrgent") ?? undefined,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await resubmitRequisition(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/requisitions/my-requests");
  revalidatePath("/requisitions/approvals");
  revalidatePath(`/requisitions/${requisitionId}`);

  return { ok: true, message: "Request resubmitted for approval." };
}
