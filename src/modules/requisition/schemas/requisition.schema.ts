import { z } from "zod";

const positiveQuantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(?:\.\d{1,3})?$/, "Enter a positive quantity with up to 3 decimal places.")
  .refine((quantity) => Number(quantity) > 0, "Quantity must be greater than zero.");

const requisitionLineSchema = z.object({
  itemId: z.coerce.number().int().positive().safe(),
  quantity: positiveQuantity,
});

export const createRequisitionSchema = z.object({
  requesterName: z.string().trim().min(1, "Enter who the items are for.").max(120),
  purpose: z.string().trim().min(1, "Enter a reason for this request.").max(1000),
  deliveryDate: z.iso.date("Enter a valid delivery date."),
  deliveryLocation: z.string().trim().min(1, "Enter a delivery location.").max(200),
  isUrgent: z.boolean(),
  lines: z.array(requisitionLineSchema).min(1, "Add at least one item.").max(20),
});

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;

/** Reads only fields the requester is allowed to provide. Session identity and status are never parsed from the form. */
export function parseRequisitionFormData(formData: FormData) {
  const lineIndexes = new Set<number>();

  for (const key of formData.keys()) {
    const match = /^(?:itemId|quantity)_(\d+)$/.exec(key);

    if (match) {
      lineIndexes.add(Number(match[1]));
    }
  }

  const lines = [...lineIndexes]
    .sort((left, right) => left - right)
    .flatMap((lineIndex) => {
      const itemId = formData.get(`itemId_${lineIndex}`);
      const quantity = formData.get(`quantity_${lineIndex}`);

      if (itemId === "" && quantity === "") {
        return [];
      }

      return [{ itemId, quantity }];
    });

  return createRequisitionSchema.safeParse({
    requesterName: formData.get("requesterName"),
    purpose: formData.get("purpose"),
    deliveryDate: formData.get("deliveryDate"),
    deliveryLocation: formData.get("deliveryLocation"),
    isUrgent: formData.get("isUrgent") === "on",
    lines,
  });
}
