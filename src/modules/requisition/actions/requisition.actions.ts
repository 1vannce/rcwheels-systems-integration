"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { parseRequisitionFormData } from "../schemas/requisition.schema";
import { createRequisition } from "../services/requisition.service";

export async function createRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let requisitionId: number;

  try {
    const actor = await requireRole(["requester"], "requisition.create");
    const parsed = parseRequisitionFormData(formData);

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    ({ requisitionId } = await createRequisition(actor, parsed.data));
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/requisitions");
  revalidatePath("/dashboard");

  return { ok: true, message: `RF-${requisitionId} was submitted for approval.` };
}
