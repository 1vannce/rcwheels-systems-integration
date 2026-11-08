import "server-only";

import type { AppRole, AppScreen } from "../types/role.type";

const sharedScreens: readonly AppScreen[] = [
  "dashboard",
  "notifications",
  "request-timeline",
];

const roleScreenMap: Record<AppRole, readonly AppScreen[]> = {
  requester: [
    ...sharedScreens,
    "requisition-new-rf",
    "requisition-my-requests",
    "delivery-acceptance-and-ar-signing",
    "delivery-rdr",
  ],
  requisition_approver: [...sharedScreens, "requisition-approval-queue"],
  inventory_custodian: [
    ...sharedScreens,
    "inventory-item-list",
    "inventory-stock-detail-and-movements",
    "inventory-issue-queue",
    "inventory-ar-preparation",
    "inventory-dispatch",
    "inventory-sales-deductions",
    "inventory-low-stock-review",
    "delivery-receipt-inspection",
    "delivery-sdr",
    "delivery-return-inspection",
  ],
  inventory_manager: [
    ...sharedScreens,
    "inventory-item-list",
    "inventory-stock-detail-and-movements",
    "inventory-adjustments",
    "inventory-low-stock-review",
  ],
  purchasing_staff: [
    ...sharedScreens,
    "purchasing-supplier-list",
    "purchasing-pr-queue",
    "purchasing-po-editor",
    "purchasing-open-po-follow-up",
  ],
  accounting_associate: [
    ...sharedScreens,
    "purchasing-accounting-review",
    "purchasing-open-po-follow-up",
  ],
  delivery_operations: [
    ...sharedScreens,
    "delivery-receiving-queue",
    "delivery-receipt-inspection",
    "delivery-internal-delivery-queue",
    "delivery-acceptance-and-ar-signing",
    "delivery-return-inspection",
  ],
  system_administrator: ["login", ...sharedScreens],
};

roleScreenMap.system_administrator = [...new Set(Object.values(roleScreenMap).flat())];

export function getVisibleScreensForRole(role: AppRole): readonly AppScreen[] {
  return roleScreenMap[role];
}

export function roleCanAccessScreen(role: AppRole, screen: AppScreen): boolean {
  return roleScreenMap[role].includes(screen);
}
