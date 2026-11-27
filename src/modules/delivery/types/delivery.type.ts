// Internal delivery read shapes: deliveries waiting for the requester, RDRs,
// and returns. Quantities travel as numeric(14, 3) decimal strings.

import type { PurchaseOrderStatus } from "@/modules/purchasing";

/** One dispatched line as the requester inspects it. */
export type DeliveryLine = {
  dispatchLineId: number;
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  sentQty: string;
  acceptedQty: string;
  returnedQty: string;
};

/**
 * A released dispatch whose acknowledgement receipt (AR) is not signed yet:
 * the Internal Delivery queue (connector C) and the requester's acceptance list.
 */
export type PendingDelivery = {
  dispatchId: number;
  acknowledgementReceiptId: number;
  requisitionId: number;
  rfNumber: string;
  isUrgent: boolean;
  requesterName: string;
  recipientUserId: number;
  deliveryLocation: string;
  deliveryPersonnel: string;
  dispatchedAt: Date;
  lines: DeliveryLine[];
};

export const internalDiscrepancyStatuses = [
  "pending_resolution",
  "replacement_approved",
  "cancelled",
] as const;

export type InternalDiscrepancyStatus = (typeof internalDiscrepancyStatuses)[number];

/** A Requester Discrepancy Report (RDR) on one dispatched line. */
export type InternalDiscrepancy = {
  internalDiscrepancyId: number;
  dispatchLineId: number;
  requisitionId: number;
  rfNumber: string;
  requesterName: string;
  approverId: number | null;
  itemCode: string;
  itemName: string;
  unit: string;
  affectedQty: string;
  /** Quantity already brought back and received into held stock. */
  returnedQty: string;
  problem: string;
  status: InternalDiscrepancyStatus;
  resolutionAction: string | null;
  reportedByName: string;
  reportedAt: Date;
};

/** A returned line still in held stock: waiting for inspection, or uncertain. */
export type ReturnLineToInspect = {
  returnLineId: number;
  returnId: number;
  internalDiscrepancyId: number;
  requisitionId: number;
  rfNumber: string;
  itemCode: string;
  itemName: string;
  unit: string;
  returnedQty: string;
  problem: string;
  returnedAt: Date;
  receivedByName: string;
  /** Set when an earlier inspection was uncertain and left the items held. */
  inspectedAt: Date | null;
};

/** The three outcomes of a return inspection (BR-DL-09). */
export const returnInspectionResults = ["usable", "damaged", "uncertain"] as const;

export type ReturnInspectionResult = (typeof returnInspectionResults)[number];

/** What a recorded supplier delivery produced (Supplier Receiving). */
export type SupplierReceiptResult = {
  supplierReceiptId: number;
  /** The PO status after the receipt: unchanged when nothing was accepted. */
  purchaseOrderStatus: PurchaseOrderStatus;
  supplierReceiptLineIds: number[];
  /** One stock movement per accepted receipt line. */
  movementIds: number[];
};
