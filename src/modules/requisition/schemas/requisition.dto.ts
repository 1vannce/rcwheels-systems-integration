import { z } from "zod";

// Create and update DTOs for the requisition module. Each DTO is both a Zod
// schema (with user-facing messages) and its inferred TypeScript type, so the
// same name is the validation contract at the action boundary and the type
// services accept. Every action parses with these before calling a service;
// the browser is never trusted (AGENTS.md).

/** A positive database primary key, coerced from form data strings. */
const id = z.coerce.number().int().positive();

/** A numeric(14, 3) value: up to 11 integer digits and up to 3 decimals. */
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.");

/** A quantity that must actually move stock or demand. */
const positiveQuantity = quantity.refine((value) => Number(value) > 0, {
  message: "Enter a quantity above zero.",
});

/** A required free-text explanation such as a rejection reason. */
const reason = z.string().trim().min(3, "Give a reason.").max(300);

/**
 * Reads a checkbox: forms submit "on" when checked and omit the field when
 * not. JSON callers may send a real boolean.
 */
const checkbox = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((value) => value === true || value === "on" || value === "true");

/** One requested item and the requested quantity. */
export const CreateRequisitionLineDto = z.object({
  itemId: id,
  requestedQty: positiveQuantity,
});

export type CreateRequisitionLineDto = z.infer<typeof CreateRequisitionLineDto>;

/**
 * The lines of one request. Duplicate items are refused so approvals and
 * reservations always refer to exactly one line per item.
 */
const requisitionLines = z
  .array(CreateRequisitionLineDto)
  .min(1, "Add at least one item.")
  .max(50, "A request can have at most 50 lines.")
  .superRefine((lines, ctx) => {
    const seen = new Set<number>();

    for (const [index, line] of lines.entries()) {
      if (seen.has(line.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "itemId"],
          message: "Each item may appear only once. Change the quantity on its existing line.",
        });
      }

      seen.add(line.itemId);
    }
  });

/**
 * A new requisition. `requesterName` is optional and used when someone submits
 * for a mechanic; the service falls back to the signed-in user's name.
 */
export const CreateRequisitionDto = z.object({
  requesterName: z
    .string()
    .trim()
    .max(120, "Use at most 120 characters for the requester's name.")
    .optional(),
  purpose: z.string().trim().min(3, "Say what the items are for.").max(300),
  isUrgent: checkbox,
  lines: requisitionLines,
});

export type CreateRequisitionDto = z.infer<typeof CreateRequisitionDto>;

/**
 * One line the approver accepts, with the quantity they authorize. The
 * approved quantity is stored separately from the requested quantity, so an
 * approver may approve less than was asked for (BR-RQ-05).
 */
export const ApproveRequisitionLineDto = z.object({
  requisitionLineId: id,
  approvedQty: positiveQuantity,
});

export type ApproveRequisitionLineDto = z.infer<typeof ApproveRequisitionLineDto>;

/**
 * An approval decision. Every approved line carries its quantity; the service
 * checks each against the requested quantity under a row lock (BR-RQ-05). A
 * line left out is not approved.
 */
export const ApproveRequisitionDto = z.object({
  requisitionId: id,
  lines: z.array(ApproveRequisitionLineDto).min(1, "Approve at least one line."),
});

export type ApproveRequisitionDto = z.infer<typeof ApproveRequisitionDto>;

/** Rejecting always records why, so the requester can correct the request. */
export const RejectRequisitionDto = z.object({
  requisitionId: id,
  reason,
});

export type RejectRequisitionDto = z.infer<typeof RejectRequisitionDto>;

/**
 * A rejected request corrected and sent back for approval. The earlier
 * decision stays in the status history (PLAN testing scenario 11).
 */
export const ResubmitRequisitionDto = CreateRequisitionDto.extend({
  requisitionId: id,
});

export type ResubmitRequisitionDto = z.infer<typeof ResubmitRequisitionDto>;

/** One line a custodian reserves, up to the outstanding need. */
export const ReserveRequisitionLineDto = z.object({
  requisitionLineId: id,
  quantity: positiveQuantity,
});

export type ReserveRequisitionLineDto = z.infer<typeof ReserveRequisitionLineDto>;

/**
 * A reservation the custodian records after the stock check. The service
 * checks each quantity against the outstanding need and the available stock
 * under the header lock (BR-RQ-07).
 */
export const ReserveRequisitionDto = z.object({
  requisitionId: id,
  lines: z.array(ReserveRequisitionLineDto).min(1, "Reserve at least one line."),
});

export type ReserveRequisitionDto = z.infer<typeof ReserveRequisitionDto>;

/** One line of a dispatch, at most the quantity reserved for it. */
export const PrepareAcknowledgementReceiptLineDto = z.object({
  requisitionLineId: id,
  sentQty: positiveQuantity,
});

export type PrepareAcknowledgementReceiptLineDto = z.infer<
  typeof PrepareAcknowledgementReceiptLineDto
>;

/**
 * The Custodian's AR preparation: a dispatch, its lines, and the prepared
 * acceptance receipt. It deducts no stock; the dispatch posts later.
 */
export const PrepareAcknowledgementReceiptDto = z.object({
  requisitionId: id,
  deliveryPersonnel: z
    .string()
    .trim()
    .min(1, "Enter the delivery person's name.")
    .max(120),
  lines: z
    .array(PrepareAcknowledgementReceiptLineDto)
    .min(1, "Add at least one line to deliver."),
});

export type PrepareAcknowledgementReceiptDto = z.infer<
  typeof PrepareAcknowledgementReceiptDto
>;

/**
 * Releases a prepared dispatch. The service posts every dispatch line at its
 * prepared sent quantity, so stock is deducted exactly once.
 */
export const DispatchRequisitionDto = z.object({
  requisitionId: id,
});

export type DispatchRequisitionDto = z.infer<typeof DispatchRequisitionDto>;
