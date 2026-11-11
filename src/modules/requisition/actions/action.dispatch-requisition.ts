"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField } from "./utils/requisition-action.form-data.util";
import { DispatchRequisitionDto } from "../schemas/requisition.dto";
import { 
    dispatchRequisitionService as dispatchRequisition 
} from "../services/requisition.dispatch.service";

/**
 * Releases the prepared dispatch. Stock is deducted exactly once here, and the
 * request moves to Out for Delivery.
 */
export async function dispatchRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");

  try {
    const user = await requireRole(["inventory_custodian"], "requisition.dispatch");
    const parsed = DispatchRequisitionDto.safeParse({ requisitionId });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await dispatchRequisition(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/dispatch");
  revalidatePath(`/requisitions/${requisitionId}`);

  return { ok: true, message: "Items dispatched; the request is Out for Delivery." };
}