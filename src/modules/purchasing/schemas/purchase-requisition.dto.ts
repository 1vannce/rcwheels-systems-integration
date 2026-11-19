import { z } from "zod";

// Create DTO for a shortage purchase requisition. The browser supplies only
// the requisition lines and their quantities; the service resolves the item
// IDs from the requisition itself.

const id = z.coerce.number().int().positive();

const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.")
  .refine((value) => Number(value) > 0, {
    message: "Enter a quantity above zero.",
  });

const line = z.object({
  requisitionLineId: id,
  requestedQty: quantity,
});

export const CreateShortagePurchaseRequisitionDto = z.object({
  requisitionId: id,
  lines: z
    .array(line)
    .min(1, "Add at least one item to the purchase request.")
    .max(50, "A purchase request can have at most 50 lines.")
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();

      for (const [index, entry] of lines.entries()) {
        if (seen.has(entry.requisitionLineId)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "requisitionLineId"],
            message: "Each requisition line may appear only once.",
          });
        }

        seen.add(entry.requisitionLineId);
      }
    }),
});

export type CreateShortagePurchaseRequisitionDto = z.infer<
  typeof CreateShortagePurchaseRequisitionDto
>;
