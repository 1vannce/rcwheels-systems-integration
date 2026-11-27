// Public API of the delivery module: export services and types only.

// Internal delivery (Phase 4): acceptance and AR signing, RDRs, and returns.
export {
  acceptDelivery,
  countPendingDeliveries,
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
// Supplier Discrepancy Reports: what was wrong and what the supplier agreed to.
export {
  agreeSupplierDiscrepancy,
  countUnresolvedSupplierDiscrepancies,
  createSupplierDiscrepancy,
  getSupplierDiscrepancy,
  listSupplierDiscrepancies,
  resolveSupplierDiscrepancy,
  updateSupplierDiscrepancy,
} from "./services/supplier-discrepancy.service";
export type {
  SupplierCommitment,
  SupplierCommitmentAction,
  SupplierDiscrepancy,
  SupplierDiscrepancyStatus,
} from "./types/supplier-discrepancy.type";
export type {
  DeliveryLine,
  InternalDiscrepancy,
  InternalDiscrepancyStatus,
  PendingDelivery,
  ReturnInspectionResult,
  ReturnLineToInspect,
  SupplierReceiptResult,
} from "./types/delivery.type";
