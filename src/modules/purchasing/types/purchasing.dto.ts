// Purchase requests (PRs) and the shortfall context shown to the Custodian.

export const purchaseRequisitionStatuses = ["open", "covered", "cancelled"] as const;

export type PurchaseRequisitionStatus = (typeof purchaseRequisitionStatuses)[number];

export const purchaseRequisitionReasons = ["shortage", "reorder"] as const;

export type PurchaseRequisitionReason = (typeof purchaseRequisitionReasons)[number];

/** One requested item on a purchase requisition. */
export type PurchaseRequisitionLineDto = {
  purchaseRequisitionLineId: number;
  purchaseRequisitionId: number;
  /** Null for a reorder PR, which is not tied to a requisition line. */
  requisitionLineId: number | null;
  /** Null for a reorder PR. */
  requisitionId: number | null;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: string;
};

/** A PR header with its lines, as the purchasing queue renders it. */
export type PurchaseRequisitionDto = {
  purchaseRequisitionId: number;
  requestedBy: number;
  requestedByName: string;
  requestedAt: Date;
  requestReason: PurchaseRequisitionReason;
  status: PurchaseRequisitionStatus;
  lines: PurchaseRequisitionLineDto[];
};

/**
 * One requisition line as the Custodian sees it while deciding what to buy.
 *
 * - `needQty` is the line's still-unreserved need.
 * - `allocatedPoQty` is what approved or placed POs already cover.
 * - `uncoveredQty` is the amount a new PR may request.
 */
export type PurchaseRequestLineContextDto = {
  requisitionLineId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  needQty: string;
  allocatedPoQty: string;
  uncoveredQty: string;
  availableQty: string;
  openPurchaseRequisitionId: number | null;
};

/** Everything the requisition detail page needs to offer the PR form. */
export type PurchaseRequestContextDto = {
  canCreate: boolean;
  /** The first open PR that already covers part of this request. */
  openPurchaseRequisition: {
    purchaseRequisitionId: number;
    requestedAt: Date;
    status: PurchaseRequisitionStatus;
  } | null;
  lines: PurchaseRequestLineContextDto[];
};
