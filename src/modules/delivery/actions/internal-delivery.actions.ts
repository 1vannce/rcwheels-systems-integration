"use server";

import { revalidatePath } from "next/cache";

import { actionFailure, requireRole, type ActionResult } from "@/modules/core";

import {
  AcceptDeliverySchema,
  InspectReturnSchema,
  ReceiveReturnSchema,
  ResolveDiscrepancySchema,
} from "../schemas/delivery.schema";
import { resolveDiscrepancy } from "../services/discrepancy.service";
import { acceptDelivery } from "../services/internal-delivery.service";
import { inspectReturnLine, receiveReturn } from "../services/return.service";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/** The JSON line list a form keeps in a hidden field; malformed input becomes []. */
function lines(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, "lines") || "[]");
  } catch {
    return [];
  }
}

function revalidateDelivery(requisitionId?: string) {
  revalidatePath("/delivery", "layout");

  if (requisitionId) {
    revalidatePath(`/requisitions/${requisitionId}`);
  }
}

/** The requester accepts or rejects each delivered line and signs the AR. */
export async function acceptDeliveryAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let rdrCount = 0;

  try {
    const user = await requireRole(["requester"], "delivery.accept");
    const parsed = AcceptDeliverySchema.safeParse({
      dispatchId: text(formData, "dispatchId"),
      lines: lines(formData),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    rdrCount = (await acceptDelivery(user, parsed.data)).discrepancyIds.length;
  } catch (error) {
    return actionFailure(error);
  }

  revalidateDelivery(text(formData, "requisitionId"));

  return {
    ok: true,
    message:
      rdrCount > 0
        ? "Acknowledgement receipt signed. The rejected items are reported for the approver to resolve."
        : "Acknowledgement receipt signed.",
  };
}

/** The assigned approver approves a replacement or cancels the rejected quantity. */
export async function resolveDiscrepancyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["requisition_approver"], "delivery.resolve-rdr");
    const parsed = ResolveDiscrepancySchema.safeParse({
      internalDiscrepancyId: text(formData, "internalDiscrepancyId"),
      decision: text(formData, "decision"),
      note: text(formData, "note"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await resolveDiscrepancy(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidateDelivery(text(formData, "requisitionId"));

  return {
    ok: true,
    message:
      text(formData, "decision") === "replace" ? "Replacement approved." : "Quantity cancelled.",
  };
}

/** Rejected items are brought back and go into held stock. */
export async function receiveReturnAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(
      ["inventory_custodian", "delivery_operations"],
      "delivery.receive-return",
    );
    const parsed = ReceiveReturnSchema.safeParse({
      internalDiscrepancyId: text(formData, "internalDiscrepancyId"),
      returnedQty: text(formData, "returnedQty"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await receiveReturn(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidateDelivery(text(formData, "requisitionId"));

  return { ok: true, message: "Return received into held stock." };
}

/** The Custodian records a return line as usable, damaged, or uncertain. */
export async function inspectReturnAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireRole(["inventory_custodian"], "delivery.inspect-return");
    const parsed = InspectReturnSchema.safeParse({
      returnLineId: text(formData, "returnLineId"),
      result: text(formData, "result"),
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await inspectReturnLine(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidateDelivery();

  return {
    ok: true,
    message:
      text(formData, "result") === "uncertain"
        ? "Marked uncertain; the items stay held until reinspected."
        : "Inspection recorded.",
  };
}
