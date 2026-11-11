"use server";

import { revalidatePath } from "next/cache";
import { actionFailure, requireRole, type ActionResult } from "@/modules/core";
import { textField, readLines } from "./utils/requisition-action.form-data.util";
import { ReserveRequisitionDto } from "../schemas/requisition.dto";
import { 
    reserveRequisitionService as reserveRequisition 
} from "../services/requisition.reserve.service";

/**
 * Reserves stock for an approved request from the issue queue. The service
 * re-checks the outstanding need and available stock and, on a shortfall,
 * moves the request to Awaiting Stock.
 */
export async function reserveRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");
  let message: string;

  try {
    const user = await requireRole(["inventory_custodian"], "requisition.reserve");

    const parsed = ReserveRequisitionDto.safeParse({
      requisitionId,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const result = await reserveRequisition(user, parsed.data);

    message =
      result.status === "awaiting_stock"
        ? "Reserved what is available; the request is now awaiting stock."
        : "Stock reserved.";
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/inventory/issue-queue");
  revalidatePath(`/requisitions/${requisitionId}`);

  return { ok: true, message };
}