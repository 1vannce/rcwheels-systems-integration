// Supplier Discrepancy Report (SDR) shapes (BR-SR-07, BR-SR-08). Quantities
// travel as numeric(14, 3) decimal strings.

export const supplierDiscrepancyStatuses = ["open", "agreed", "resolved"] as const;

export type SupplierDiscrepancyStatus = (typeof supplierDiscrepancyStatuses)[number];

/** What the supplier commits to. "replace" is a follow-up delivery. */
export const supplierCommitmentActions = ["replace", "credit", "cancel"] as const;

export type SupplierCommitmentAction = (typeof supplierCommitmentActions)[number];

export type SupplierCommitment = {
  agreedAction: SupplierCommitmentAction;
  committedQty: string;
  expectedDeliveryDate: Date;
  status: "open" | "fulfilled";
  recordedAt: Date;
};

export type SupplierDiscrepancy = {
  supplierDiscrepancyId: number;
  purchaseOrderId: number;
  purchaseOrderLineId: number;
  /** Null when the report is about items that never arrived. */
  supplierReceiptLineId: number | null;
  supplierName: string;
  itemCode: string;
  itemName: string;
  unit: string;
  affectedQty: string;
  problem: string;
  status: SupplierDiscrepancyStatus;
  resolutionAction: string | null;
  reportedByName: string;
  reportedAt: Date;
  commitment: SupplierCommitment | null;
};
