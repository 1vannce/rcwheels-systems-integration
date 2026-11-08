export const appRoles = [
  "requester",
  "requisition_approver",
  "inventory_custodian",
  "inventory_manager",
  "purchasing_staff",
  "accounting_associate",
  "delivery_operations",
  "system_administrator",
] as const;

export type AppRole = (typeof appRoles)[number];

export const appScreens = [
  "login",
  "dashboard",
  "notifications",
  "request-timeline",
  "requisition-new-rf",
  "requisition-my-requests",
  "requisition-approval-queue",
  "inventory-item-list",
  "inventory-stock-detail-and-movements",
  "inventory-issue-queue",
  "inventory-ar-preparation",
  "inventory-dispatch",
  "inventory-adjustments",
  "inventory-sales-deductions",
  "inventory-low-stock-review",
  "purchasing-supplier-list",
  "purchasing-pr-queue",
  "purchasing-po-editor",
  "purchasing-accounting-review",
  "purchasing-open-po-follow-up",
  "delivery-receiving-queue",
  "delivery-receipt-inspection",
  "delivery-sdr",
  "delivery-internal-delivery-queue",
  "delivery-acceptance-and-ar-signing",
  "delivery-rdr",
  "delivery-return-inspection",
] as const;

export type AppScreen = (typeof appScreens)[number];
