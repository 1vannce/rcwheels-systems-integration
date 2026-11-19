"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import { CreateShortagePurchaseRequisitionDto } from "../schemas/purchase-requisition.dto";
import { createShortagePurchaseRequisitionService } from "../services/purchase-requisition.create.service";
import { formatPrNumber } from "../utils/pr-number.util";
import { readLines, textField } from "./utils/purchasing-action.form-data.util";

/**
 * Raises a shortage purchase request for an awaiting-stock requisition. The
 * action authenticates the Custodian, parses the whole form with the DTO, and
 * calls exactly one service.
 */
export async function createShortagePurchaseRequisitionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const requisitionId = textField(formData, "requisitionId");
  let message: string;

  try {
    const user = await requireRole(["inventory_custodian"], "purchase_requisition.create");

    const parsed = CreateShortagePurchaseRequisitionDto.safeParse({
      requisitionId,
      lines: readLines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      user,
      parsed.data,
    );

    message = `Purchase request ${formatPrNumber(purchaseRequisitionId)} created.`;
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath(`/requisitions/${requisitionId}`);
  revalidatePath("/inventory/issue-queue");
  revalidatePath("/purchasing/requisitions");

  return { ok: true, message };
}
