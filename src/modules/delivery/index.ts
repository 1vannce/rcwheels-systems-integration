// Public API of the delivery module: export services and types only.

// Internal delivery (Phase 4): acceptance and AR signing, RDRs, and returns.
export {
  acceptDelivery,
  listDeliveriesToAccept,
  listInternalDeliveryQueue,
} from "./services/internal-delivery.service";
export { listDiscrepancies, resolveDiscrepancy } from "./services/discrepancy.service";
export {
  inspectReturnLine,
  listReturnLinesToInspect,
  listReturnsToReceive,
  receiveReturn,
} from "./services/return.service";
// Supplier receiving (Phase 6): inspect a delivery against the PO balance.
export { receiveSupplierDelivery } from "./services/supplier-receiving.service";
export type {
  DeliveryLine,
  InternalDiscrepancy,
  InternalDiscrepancyStatus,
  PendingDelivery,
  ReturnInspectionResult,
  ReturnLineToInspect,
  SupplierReceiptResult,
} from "./types/delivery.type";
