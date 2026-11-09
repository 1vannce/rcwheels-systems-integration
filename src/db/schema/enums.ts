import { pgEnum } from "drizzle-orm/pg-core";

// Kept in one file so table files never have to import an enum from a table
// file, which would create a circular import.

export const appRoleEnum = pgEnum("app_role", [
  "requester",
  "requisition_approver",
  "inventory_custodian",
  "inventory_manager",
  "purchasing_staff",
  "accounting_associate",
  "delivery_operations",
  "system_administrator",
]);

export const stockConditionEnum = pgEnum("stock_condition", [
  "usable",
  "damaged",
  "hold",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "consumed",
  "released",
]);

export const adjustmentStatusEnum = pgEnum("adjustment_status", [
  "pending",
  "approved",
  "rejected",
]);

// One value per stock event in PLAN.md section 7, plus the opening balance used
// when a stock count is recorded.
export const movementTypeEnum = pgEnum("stock_movement_type", [
  "supplier_receipt",
  "dispatch",
  "acceptance",
  "return",
  "return_inspection",
  "sales_deduction",
  "sales_reversal",
  "adjustment",
  "supplier_return",
  "opening_balance",
]);

export const requisitionStatusEnum = pgEnum("requisition_status", [
  "pending_approval",
  "rejected",
  "approved",
  "awaiting_stock",
  "for_delivery",
  "out_for_delivery",
  "pending_resolution",
  "fulfilled",
  "cancelled",
]);

export const purchaseRequisitionStatusEnum = pgEnum(
  "purchase_requisition_status",
  ["open", "covered", "cancelled"],
);

export const purchaseRequisitionReasonEnum = pgEnum(
  "purchase_requisition_reason",
  ["shortage", "reorder"],
);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "pending_approval",
  "for_revision",
  "approved",
  "placed",
  "partially_received",
  "closed",
  "cancelled",
]);

export const supplierDiscrepancyStatusEnum = pgEnum(
  "supplier_discrepancy_status",
  ["open", "agreed", "resolved"],
);

export const internalDiscrepancyStatusEnum = pgEnum(
  "internal_discrepancy_status",
  ["pending_resolution", "replacement_approved", "cancelled"],
);
