"use server"

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { CreateRequisitionDto } from "../schemas/requisition.dto";
import { textField, readLines } from "./utils/requisition-action.form-data.util";
import { 
    submitRequisitionService as submitRequisition 
} from "../services/requisition.submit.service";

/**
 * Submits the new-requisition form.
 *
 * The action authenticates, checks the requester role, parses the whole form
 * with the Create DTO (which carries the user-facing messages), calls exactly
 * one service, then revalidates the list. It never touches the database.
 */
export async function submitRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["requester"], "requisition.submit");

    const parsed = CreateRequisitionDto.safeParse({
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

    await submitRequisition(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/requisitions");

  return {
    ok: true,
    message: "Request submitted for approval. Your assigned approver has been notified.",
  };
}
