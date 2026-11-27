// Suppliers, purchase requests (PRs), and the shortfall context shown to the
// Custodian.

/** A supplier the Purchasing Staff may choose for a purchase order. */
export type SupplierDto = {
  supplierId: number;
  supplierName: string;
  contactPerson: string | null;
  contactDetails: string | null;
  address: string | null;
};

export const purchaseOrderStatuses = [
  "pending_approval",
  "for_revision",
  "approved",
  "placed",
  "partially_received",
  "closed",
  "cancelled",
] as const;

export type PurchaseOrderStatus = (typeof purchaseOrderStatuses)[number];

/** One PR line available to turn into a PO, with its active PO coverage. */
export type PurchaseOrderSourceLineDto = {
  purchaseRequisitionLineId: number;
  purchaseRequisitionId: number;
  requisitionLineId: number | null;
  /** Null for a reorder PR. */
  requisitionId: number | null;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: string;
  allocatedQty: string;
  remainingQty: string;
};

/** One line on a purchase order. */
export type PurchaseOrderLineDto = {
  purchaseOrderLineId: number;
  purchaseOrderId: number;
  purchaseRequisitionId: number;
  purchaseRequisitionLineId: number;
  requisitionLineId: number | null;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  orderedQty: string;
  unitPrice: string;
  cancelledQty: string;
  /** Accepted quantity from supplier receipts. */
  acceptedQty: string;
  /** Ordered minus cancelled and accepted, clamped at zero. */
  outstandingQty: string;
};

/** A PO as Supplier Receiving sees it: header status and each line's balance. */
export type PurchaseOrderForReceivingDto = {
  purchaseOrderId: number;
  status: PurchaseOrderStatus;
  cancelledAt: Date | null;
  lines: PurchaseOrderLineDto[];
};

/** One immutable PO version snapshot. */
export type PurchaseOrderRevisionDto = {
  revisionId: number;
  purchaseOrderId: number;
  versionNo: number;
  changedBy: number;
  changedByName: string;
  reviewedBy: number | null;
  reviewedByName: string | null;
  budgetOk: boolean | null;
  reviewReason: string | null;
  snapshot: string;
  createdAt: Date;
  reviewedAt: Date | null;
};

/** A PO header with its lines, as the purchasing screens render it. */
export type PurchaseOrderDto = {
  purchaseOrderId: number;
  supplierId: number;
  supplierName: string;
  preparedBy: number;
  preparedByName: string;
  approvedBy: number | null;
  approvedByName: string | null;
  orderedAt: Date | null;
  approvedAt: Date | null;
  status: PurchaseOrderStatus;
  currentVersion: number;
  deliveryTerms: string | null;
  supplierConfirmedAt: Date | null;
  cancelledBy: number | null;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  lines: PurchaseOrderLineDto[];
};

/** A PO with its lines and every stored version. */
export type PurchaseOrderDetailDto = PurchaseOrderDto & {
  revisions: PurchaseOrderRevisionDto[];
};

/** One line in a stored PO snapshot. */
export type PurchaseOrderSnapshotLine = {
  purchaseRequisitionLineId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  orderedQty: string;
  unitPrice: string;
};

/** The committed content of one PO version. */
export type PurchaseOrderSnapshot = {
  supplier: SupplierDto;
  deliveryTerms: string | null;
  lines: PurchaseOrderSnapshotLine[];
};

/** One added, removed, or changed line between two PO versions. */
export type PurchaseOrderSnapshotLineChange = {
  purchaseRequisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  change: "added" | "removed" | "changed";
  previousOrderedQty: string | null;
  orderedQty: string | null;
  previousUnitPrice: string | null;
  unitPrice: string | null;
};

/** What changed between the previous and current PO version. */
export type PurchaseOrderSnapshotDiff = {
  supplierChanged: boolean;
  previousSupplierName: string;
  supplierName: string;
  deliveryTermsChanged: boolean;
  previousDeliveryTerms: string | null;
  deliveryTerms: string | null;
  lineChanges: PurchaseOrderSnapshotLineChange[];
  hasChanges: boolean;
};

/** Coverage of one PR line by PO lines, split by whether the PO is committed. */
export type PurchaseRequisitionCoverageLineDto = {
  purchaseRequisitionLineId: number;
  requestedQty: string;
  /** Approved, placed, received, or closed PO quantity. */
  committedQty: string;
  /** Quantity held by POs still waiting for Accounting. */
  draftQty: string;
  remainingQty: string;
};

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

/** The PR header shown above the PO editor. */
export type PurchaseRequisitionSummaryDto = {
  purchaseRequisitionId: number;
  requestedByName: string;
  requestedAt: Date;
  requestReason: PurchaseRequisitionReason;
  status: PurchaseRequisitionStatus;
};

/** Everything the Accounting review detail needs for one PO. */
export type PurchaseOrderReviewContextDto = {
  order: PurchaseOrderDetailDto;
  supplier: SupplierDto | null;
  sourcePurchaseRequisition: PurchaseRequisitionSummaryDto | null;
  /** Null for version 1, or when a snapshot cannot be read. */
  versionDiff: PurchaseOrderSnapshotDiff | null;
  /** True when the current version snapshot is missing or malformed. */
  snapshotUnavailable: boolean;
};

/** Everything the Purchasing Staff PO form needs for one open PR. */
export type PurchaseOrderFormContextDto = {
  purchaseRequisition: PurchaseRequisitionSummaryDto;
  lines: PurchaseOrderSourceLineDto[];
  suppliers: SupplierDto[];
};

/** The stored PO plus the source quantities and suppliers for editing. */
export type PurchaseOrderEditContextDto = {
  order: PurchaseOrderDetailDto;
  sourceLines: PurchaseOrderSourceLineDto[];
  suppliers: SupplierDto[];
  canEdit: boolean;
  canPlace: boolean;
  canDiscard: boolean;
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
