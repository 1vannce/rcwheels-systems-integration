"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField } from "./utils/requisition-action.form-data.util";
import { MarkRequisitionFulfilledDto } from "../schemas/requisition.dto";
import { markRequisitionFulfilledService as markRequisitionFulfilled } from "../services/requisition.delivery.service";

/** The assigned approver closes a Delivered request as Fulfilled (decision 5). */
export async function markRequisitionFulfilledAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["requisition_approver"], "requisition.fulfil");
    const parsed = MarkRequisitionFulfilledDto.safeParse({ requisitionId });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await markRequisitionFulfilled(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath(`/requisitions/${requisitionId}`);
  revalidatePath("/requisitions/completed");

  return { ok: true, message: "Request marked Fulfilled." };
}
