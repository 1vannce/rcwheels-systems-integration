import { z } from "zod";

// Create DTO for a purchase order draft prepared from a purchase requisition.
// The browser supplies the supplier, terms, and line quantities and prices; the
// service resolves the item and PR relationships from the database.

const id = z.coerce.number().int().positive();

/** numeric(14, 3), above zero. */
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a quantity with up to 3 decimal places.")
  .refine((value) => Number(value) > 0, {
    message: "Enter a quantity above zero.",
  });

/** numeric(12, 2), above zero. */
const unitPrice = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a price with up to 2 decimal places.")
  .refine((value) => Number(value) > 0, {
    message: "Enter a unit price above zero.",
  });

const line = z.object({
  purchaseRequisitionLineId: id,
  orderedQty: quantity,
  unitPrice,
});

export const CreatePurchaseOrderDto = z.object({
  purchaseRequisitionId: id,
  supplierId: id,
  deliveryTerms: z
    .string()
    .trim()
    .max(300, "Use at most 300 characters for the delivery terms.")
    .optional()
    .transform((value) => (value ? value : null)),
  lines: z
    .array(line)
    .min(1, "Add at least one item to the purchase order.")
    .max(50, "A purchase order can have at most 50 lines.")
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();

      for (const [index, entry] of lines.entries()) {
        if (seen.has(entry.purchaseRequisitionLineId)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "purchaseRequisitionLineId"],
            message: "Each purchase request line may appear only once.",
          });
        }

        seen.add(entry.purchaseRequisitionLineId);
      }
    }),
});

export type CreatePurchaseOrderDto = z.infer<typeof CreatePurchaseOrderDto>;

/** A revised PO version. The source PR is derived from the stored PO lines. */
export const UpdatePurchaseOrderDto = CreatePurchaseOrderDto.omit({
  purchaseRequisitionId: true,
}).extend({
  purchaseOrderId: id,
});

export type UpdatePurchaseOrderDto = z.infer<typeof UpdatePurchaseOrderDto>;

/** Accounting approves the exact current PO version. */
export const ApprovePurchaseOrderDto = z.object({
  purchaseOrderId: id,
});

export type ApprovePurchaseOrderDto = z.infer<typeof ApprovePurchaseOrderDto>;

/** Accounting returns a PO version with a reason for Purchasing Staff. */
export const ReturnPurchaseOrderDto = z.object({
  purchaseOrderId: id,
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason for returning the purchase order.")
    .max(300, "Use at most 300 characters for the reason."),
});

export type ReturnPurchaseOrderDto = z.infer<typeof ReturnPurchaseOrderDto>;

/** Purchasing Staff withdraw an unapproved PO draft before Accounting acts. */
export const DiscardPurchaseOrderDraftDto = z.object({
  purchaseOrderId: id,
});

export type DiscardPurchaseOrderDraftDto = z.infer<typeof DiscardPurchaseOrderDraftDto>;

/** Purchasing Staff places an approved PO with the supplier. */
export const PlacePurchaseOrderDto = z.object({
  purchaseOrderId: id,
});

export type PlacePurchaseOrderDto = z.infer<typeof PlacePurchaseOrderDto>;
