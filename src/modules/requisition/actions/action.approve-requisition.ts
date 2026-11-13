"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { 
    textField, 
    readLines 
} from "./utils/requisition-action.form-data.util";
import { ApproveRequisitionDto } from "../schemas/requisition.dto";
import { 
    approveRequisitionService as approveRequisition
} from "../services/requisition.approve.service";

/**
 * Approves a request from the approver's queue, applying the per-line approved
 * quantities the form collected. The service re-checks role, assignment, status,
 * and approved <= requested under the header lock.
 */
export async function approveRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["requisition_approver"], "requisition.approve");

    const parsed = ApproveRequisitionDto.safeParse({
      requisitionId,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await approveRequisition(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/requisitions/approvals");
  revalidatePath("/requisitions/my-requests");
  revalidatePath(`/requisitions/${requisitionId}`);
  revalidatePath("/inventory/issue-queue");

  return { ok: true, message: "Request approved." };
}
