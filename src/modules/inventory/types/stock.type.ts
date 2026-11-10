export const stockConditions = ["usable", "damaged", "hold"] as const;

export type StockCondition = (typeof stockConditions)[number];

export type MovementType =
  | "supplier_receipt"
  | "dispatch"
  | "acceptance"
  | "return"
  | "return_inspection"
  | "sales_deduction"
  | "sales_reversal"
  | "adjustment"
  | "supplier_return"
  | "opening_balance"
  | "reservation"
  | "reservation_release";

/** One stock_balances row, as read while it is locked. */
export type StockBalance = {
  stockBalanceId: number;
  itemId: number;
  condition: StockCondition;
  quantityOnHand: string;
  isIncomplete: boolean;
};

/**
 * An item with every stock figure. Quantities are decimal strings. Reserved
 * and in transit are derived from reservations and dispatch lines, and
 * available is usable on hand minus active reservations.
 */
export type ItemStock = {
  itemId: number;
  itemCode: string;
  itemName: string;
  specification: string;
  unit: string;
  reorderPoint: string;
  averageCost: string;
  usable: string;
  reserved: string;
  available: string;
  inTransit: string;
  held: string;
  damaged: string;
  isIncomplete: boolean;
};

export type StockMovement = {
  movementId: number;
  movementType: MovementType;
  condition: StockCondition;
  quantityDelta: string;
  unitCost: string | null;
  eventKey: string;
  postedAt: Date;
  reversesMovementId: number | null;
};

export type SalesDeduction = {
  movementId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: string;
  eventKey: string;
  postedAt: Date;
  reversedByMovementId: number | null;
};

export type AdjustmentStatus = "pending" | "approved" | "rejected";

export type StockAdjustment = {
  adjustmentId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  condition: StockCondition;
  recordedQty: string;
  countedQty: string;
  reason: string;
  status: AdjustmentStatus;
  countedAt: Date;
  countedById: number;
  countedByName: string;
  approvedByName: string | null;
};
