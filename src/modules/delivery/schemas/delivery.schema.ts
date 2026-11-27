import { z } from "zod";

// Action input for internal delivery. Every action parses with these before it
// calls a service; the browser is never trusted (AGENTS.md).

const id = z.coerce.number().int().positive();

/** A numeric(14, 3) value: up to 11 integer digits and up to 3 decimals. */
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.");

const positiveQuantity = quantity.refine((value) => Number(value) > 0, {
  message: "Enter a quantity above zero.",
});

/** The requester's decision on one dispatched line. */
export const AcceptDeliveryLineSchema = z
  .object({
    dispatchLineId: id,
    acceptedQty: quantity,
    rejectedQty: quantity,
    problem: z.string().trim().max(300).optional().default(""),
  })
  .refine((line) => Number(line.rejectedQty) === 0 || line.problem.length >= 3, {
    message: "Describe the problem with the rejected items.",
    path: ["problem"],
  });

/**
 * Accepting a delivery signs its AR. Every line is accepted, rejected, or
 * split between the two; rejected quantity becomes an RDR (BR-DL-04, BR-DL-07).
 */
export const AcceptDeliverySchema = z.object({
  dispatchId: id,
  lines: z.array(AcceptDeliveryLineSchema).min(1, "The delivery has no lines."),
});

export type AcceptDeliveryInput = z.infer<typeof AcceptDeliverySchema>;

/** The approver's decision on an RDR (BR-DL-10). */
export const ResolveDiscrepancySchema = z.object({
  internalDiscrepancyId: id,
  decision: z.enum(["replace", "cancel"], { message: "Choose replace or cancel." }),
  note: z.string().trim().min(3, "Give a short reason for the decision.").max(300),
});

export type ResolveDiscrepancyInput = z.infer<typeof ResolveDiscrepancySchema>;

/** Rejected items brought back to the stockroom (in transit to held). */
export const ReceiveReturnSchema = z.object({
  internalDiscrepancyId: id,
  returnedQty: positiveQuantity,
});

export type ReceiveReturnInput = z.infer<typeof ReceiveReturnSchema>;

/** The Custodian's inspection of one returned line (BR-DL-09). */
export const InspectReturnSchema = z.object({
  returnLineId: id,
  result: z.enum(["usable", "damaged", "uncertain"], {
    message: "Choose usable, damaged, or uncertain.",
  }),
});

export type InspectReturnInput = z.infer<typeof InspectReturnSchema>;

/** One PO line as the Custodian inspects it on a supplier delivery (BR-SR-03). */
export const ReceiveSupplierDeliveryLineSchema = z
  .object({
    purchaseOrderLineId: id,
    deliveredQty: positiveQuantity,
    acceptedQty: quantity,
    rejectedQty: quantity,
    inspectionNotes: z.string().trim().max(300).optional().default(""),
  })
  .refine((line) => Number(line.rejectedQty) === 0 || line.inspectionNotes.length >= 3, {
    message: "Describe the problem with the rejected items.",
    path: ["inspectionNotes"],
  });

/**
 * A supplier delivery against a placed PO: the delivery receipt and invoice
 * numbers and the inspected lines (BR-SR-02). The service checks every line
 * against the PO's outstanding balance, never this input alone (BR-SR-04).
 */
export const ReceiveSupplierDeliverySchema = z.object({
  purchaseOrderId: id,
  deliveryReceiptNo: z.string().trim().min(1, "Enter the delivery receipt number.").max(60),
  invoiceNo: z.string().trim().max(60).optional().default(""),
  lines: z.array(ReceiveSupplierDeliveryLineSchema).min(1, "Record at least one delivered line."),
});

export type ReceiveSupplierDeliveryInput = z.infer<typeof ReceiveSupplierDeliverySchema>;
