"use server"

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField } from "./utils/requisition-action.form-data.util";
import { RejectRequisitionDto } from "../schemas/requisition.dto";
import { 
    rejectRequisitionService as rejectRequisition 
} from "../services/requisition.reject.service";

/**
 * Rejects a request with the reason the approver typed. The requester is
 * notified and can correct and resubmit.
 */
export async function rejectRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["requisition_approver"], "requisition.reject");

    const parsed = RejectRequisitionDto.safeParse({
      requisitionId,
      reason: textField(formData, "reason"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await rejectRequisition(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/requisitions/approvals");
  revalidatePath(`/requisitions/${requisitionId}`);

  return { ok: true, message: "Request rejected." };
}