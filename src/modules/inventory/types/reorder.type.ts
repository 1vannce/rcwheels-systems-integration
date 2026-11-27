export type PurchaseOrderCoverage = {
  purchaseOrderId: number;
  status: string;
  /** Ordered - cancelled - accepted, across the PO's lines for the item. */
  outstandingQty: string;
};

export type PurchaseRequisitionCoverage = {
  purchaseRequisitionId: number;
  /** Requested quantity not yet on a PO that is not cancelled. */
  unorderedQty: string;
};

/** Open demand already raised for an item, shown on its reorder alert. */
export type ReorderCoverage = {
  purchaseOrders: PurchaseOrderCoverage[];
  purchaseRequisitions: PurchaseRequisitionCoverage[];
  /** Outstanding PO quantity plus unordered PR quantity. */
  totalQty: string;
};

export type ReorderCheckResult =
  | { alerted: false }
  | { alerted: true; available: string; reorderPoint: string; coverage: ReorderCoverage; message: string };
