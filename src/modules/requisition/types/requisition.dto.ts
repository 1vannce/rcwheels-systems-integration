// Requisition and issue read DTOs: the request header, its lines, and the
// append-only status history. These are the shapes services return and pages
// render. Quantities mirror the database's numeric(14, 3) columns and travel
// as decimal strings, never JavaScript floats.
//
// Reserved, dispatched, accepted, returned, outstanding, unissued, and
// available figures are derived from stock_reservations and dispatch_lines.
// They are never stored on the line, so they cannot drift (PLAN section 7).

/**
 * Every status a requisition can hold, in workflow order. Mirrors the
 * `requisition_status` database enum. This is a shared domain constant, not a
 * DTO.
 */
export const requisitionStatuses = [
  "pending_approval",
  "rejected",
  "approved",
  "awaiting_stock",
  "for_delivery",
  "out_for_delivery",
  "pending_resolution",
  "fulfilled",
  "cancelled",
] as const;

export type RequisitionStatus = (typeof requisitionStatuses)[number];

/** A requisition header with the requester's display name resolved. */
export type RequisitionDto = {
  requisitionId: number;
  /** The signed-in user who submitted it, even when it is for someone else. */
  submittedBy: number;
  submittedByName: string;
  /** The active mechanic account the request was filed for, if any. */
  requestedForUserId: number | null;
  /** The submitter's assigned approver, to whom the request is routed. */
  approverId: number | null;
  /** The person the items are for. Defaults to the submitter's name. */
  requesterName: string;
  submittedAt: Date;
  isUrgent: boolean;
  purpose: string;
  deliveryDate: string;
  deliveryLocation: string;
  status: RequisitionStatus;
};

/** An active mechanic account available as an optional RF recipient. */
export type RequisitionMechanicOptionDto = {
  userId: number;
  fullName: string;
};

/** A header row for list screens, with a count instead of the full lines. */
export type RequisitionListItemDto = RequisitionDto & {
  lineCount: number;
};

/**
 * One requested item with every figure a queue or detail screen needs.
 *
 * - `reservedQty` is the sum of this line's active reservations.
 * - `dispatchedQty`, `acceptedQty`, and `returnedQty` come from dispatch lines.
 * - `outstandingQty` = approved - cancelled - accepted - returned.
 * - `unissuedQty` = approved - cancelled - in transit, where in transit is
 *   dispatched - accepted - returned.
 * - `reservableQty` = unissued - reserved (approved - cancelled - dispatched +
 *   returned - reserved), the most a custodian may still reserve on this line.
 * - `availableStock` is the item's usable on hand minus all active
 *   reservations, which is what a new reservation may still claim.
 */
export type RequisitionLineDto = {
  requisitionLineId: number;
  requisitionId: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: string;
  approvedQty: string;
  cancelledQty: string;
  reservedQty: string;
  dispatchedQty: string;
  acceptedQty: string;
  returnedQty: string;
  outstandingQty: string;
  unissuedQty: string;
  reservableQty: string;
  availableStock: string;
};

/** One append-only entry in a requisition's status history. */
export type RequisitionStatusEntryDto = {
  historyId: number;
  requisitionId: number;
  changedBy: number;
  changedByName: string;
  /** Null on the first submission, which has no previous status. */
  fromStatus: RequisitionStatus | null;
  toStatus: RequisitionStatus;
  reason: string | null;
  changedAt: Date;
};

/** Everything a requisition detail screen renders in one value. */
export type RequisitionDetailDto = {
  requisition: RequisitionDto;
  lines: RequisitionLineDto[];
  history: RequisitionStatusEntryDto[];
};
