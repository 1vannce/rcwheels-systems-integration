"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import {
  actionFailure,
  requireRole,
  type ActionResult,
  type AppRole,
  type AppUser,
} from "@/modules/core";

import {
  AgreeSupplierDiscrepancySchema,
  CreateSupplierDiscrepancySchema,
  ResolveSupplierDiscrepancySchema,
  UpdateSupplierDiscrepancySchema,
} from "../schemas/supplier-discrepancy.schema";
import {
  agreeSupplierDiscrepancy,
  createSupplierDiscrepancy,
  resolveSupplierDiscrepancy,
  updateSupplierDiscrepancy,
} from "../services/supplier-discrepancy.service";

/** Checks the role, parses the form, calls one service, and revalidates. */
async function run<Schema extends z.ZodType>(
  formData: FormData,
  options: {
    roles: AppRole[];
    action: string;
    schema: Schema;
    service: (user: AppUser, input: z.output<Schema>) => Promise<unknown>;
    message: string;
  },
): Promise<ActionResult> {
  try {
    const user = await requireRole(options.roles, options.action);
    // An unused optional field arrives as an empty string.
    const parsed = options.schema.safeParse(
      Object.fromEntries([...formData].filter(([, value]) => value !== "")),
    );

    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    await options.service(user, parsed.data);
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/delivery", "layout");
  revalidatePath("/purchasing", "layout");

  return { ok: true, message: options.message };
}

/** The Custodian records a report the receipt did not open by itself. */
export async function createSupplierDiscrepancyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(formData, {
    roles: ["inventory_custodian"],
    action: "supplier_discrepancy.create",
    schema: CreateSupplierDiscrepancySchema,
    service: createSupplierDiscrepancy,
    message: "Supplier discrepancy report recorded.",
  });
}

export async function updateSupplierDiscrepancyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(formData, {
    roles: ["inventory_custodian"],
    action: "supplier_discrepancy.update",
    schema: UpdateSupplierDiscrepancySchema,
    service: updateSupplierDiscrepancy,
    message: "Report updated.",
  });
}

/** Purchasing records what the supplier committed to. */
export async function agreeSupplierDiscrepancyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(formData, {
    roles: ["purchasing_staff"],
    action: "supplier_discrepancy.agree",
    schema: AgreeSupplierDiscrepancySchema,
    service: agreeSupplierDiscrepancy,
    message: "Supplier commitment recorded.",
  });
}

export async function resolveSupplierDiscrepancyAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(formData, {
    roles: ["inventory_custodian", "purchasing_staff"],
    action: "supplier_discrepancy.resolve",
    schema: ResolveSupplierDiscrepancySchema,
    service: resolveSupplierDiscrepancy,
    message: "Report resolved.",
  });
}
