import { z } from "zod";

import { stockConditions } from "../types/stock.type";

const id = z.coerce.number().int().positive();

// A numeric(14, 3) value as a decimal string: digits, then up to 3 decimals.
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.");

const positiveQuantity = quantity.refine((value) => Number(value) > 0, {
  message: "Enter a quantity above zero.",
});

export const createItemSchema = z.object({
  itemCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,30}$/, "Use 2 to 30 letters, digits, or hyphens for the code."),
  itemName: z.string().trim().min(1, "Enter the item name.").max(120),
  specification: z.string().trim().min(1, "Enter the specification.").max(200),
  unit: z.string().trim().min(1, "Enter the unit.").max(20),
  reorderPoint: quantity,
});

export const updateReorderPointSchema = z.object({
  itemId: id,
  reorderPoint: quantity,
});

export const requestAdjustmentSchema = z.object({
  itemId: id,
  condition: z.enum(stockConditions),
  countedQty: quantity,
  reason: z.string().trim().min(3, "Give a reason for the count.").max(300),
});

export const approveAdjustmentSchema = z.object({ adjustmentId: id });

export const rejectAdjustmentSchema = z.object({
  adjustmentId: id,
  reason: z.string().trim().min(3, "Give a reason for rejecting.").max(300),
});

export const recordSalesDeductionSchema = z.object({
  itemId: id,
  quantity: positiveQuantity,
  salesRef: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,40}$/, "Use letters, digits, or hyphens for the sales reference."),
  saleDate: z.iso.date("Enter the sale date."),
});

export const reverseSalesDeductionSchema = z.object({
  movementId: id,
  reason: z.string().trim().min(3, "Give a reason for the reversal.").max(300),
});
