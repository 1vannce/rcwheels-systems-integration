import { z } from "zod";

import { supplierCommitmentActions } from "../types/supplier-discrepancy.type";

// Action input for Supplier Discrepancy Reports (BR-SR-07, BR-SR-08). The
// service checks every ID and quantity against the stored PO.

const id = z.coerce.number().int().positive();

/** A numeric(14, 3) value above zero. */
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.")
  .refine((value) => Number(value) > 0, { message: "Enter a quantity above zero." });

const problem = z.string().trim().min(3, "Describe the problem.").max(300);

export const CreateSupplierDiscrepancySchema = z.object({
  purchaseOrderId: id,
  purchaseOrderLineId: id,
  supplierReceiptLineId: id.optional(),
  affectedQty: quantity,
  problem,
});

export type CreateSupplierDiscrepancyInput = z.infer<typeof CreateSupplierDiscrepancySchema>;

export const UpdateSupplierDiscrepancySchema = z.object({
  supplierDiscrepancyId: id,
  affectedQty: quantity,
  problem,
});

export type UpdateSupplierDiscrepancyInput = z.infer<typeof UpdateSupplierDiscrepancySchema>;

export const AgreeSupplierDiscrepancySchema = z.object({
  supplierDiscrepancyId: id,
  agreedAction: z.enum(supplierCommitmentActions, {
    message: "Choose replace, credit, or cancel the balance.",
  }),
  committedQty: quantity,
  expectedDeliveryDate: z.iso
    .date("Enter the expected date.")
    .transform((value) => new Date(value)),
});

export type AgreeSupplierDiscrepancyInput = z.infer<typeof AgreeSupplierDiscrepancySchema>;

export const ResolveSupplierDiscrepancySchema = z.object({
  supplierDiscrepancyId: id,
  note: z.string().trim().min(3, "Say how the report was resolved.").max(300),
});

export type ResolveSupplierDiscrepancyInput = z.infer<typeof ResolveSupplierDiscrepancySchema>;
