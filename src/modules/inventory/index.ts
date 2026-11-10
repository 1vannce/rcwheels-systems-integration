// Public API of the inventory module: export services and types only.
export {
  approveAdjustment,
  listAdjustments,
  rejectAdjustment,
  requestAdjustment,
} from "./services/adjustment.service";
export {
  createItem,
  getItemStockDetail,
  listItemsWithStock,
  updateReorderPoint,
} from "./services/item.service";
export { formatQuantity } from "./services/quantity.service";
export {
  listSalesDeductions,
  recordSalesDeduction,
  reverseSalesDeduction,
  todayInManila,
} from "./services/sales-deduction.service";
// Stock events. Other modules call these and pass their own transaction.
export {
  acceptDispatchedItems,
  acceptSupplierReceipt,
  dispatchStock,
  dispatchStockLines,
  inspectReturn,
  receiveReturnedItems,
  releaseReservation,
  reserveStock,
  reserveStockForLines,
  returnToSupplier,
} from "./services/stock.service";
export type {
  AdjustmentStatus,
  ItemStock,
  MovementType,
  SalesDeduction,
  StockAdjustment,
  StockCondition,
  StockMovement,
} from "./types/stock.type";
