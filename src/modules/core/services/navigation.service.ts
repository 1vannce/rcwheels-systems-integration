import "server-only";

import type { NavigationGroup } from "../types/navigation.type";
import type { AppRole, AppScreen } from "../types/role.type";
import { roleCanAccessScreen } from "./role-access.service";

type ScreenRoute = {
  label: string;
  href: string;
  group: string;
  /** Detail screens are reached from another screen, not from the menu. */
  inMenu?: false;
};

// Screens whose pages exist. The rest open a placeholder until their phase.
const builtScreens: readonly AppScreen[] = [
  "dashboard",
  "notifications",
  "requisition-new-rf",
  "requisition-my-requests",
  "inventory-item-list",
  "inventory-adjustments",
  "inventory-sales-deductions",
];

const screenRoutes: Record<Exclude<AppScreen, "login">, ScreenRoute> = {
  dashboard: { label: "Dashboard", href: "/dashboard", group: "Shared" },
  notifications: { label: "Notifications", href: "/notifications", group: "Shared" },
  "request-timeline": { label: "Request timeline", href: "/timeline", group: "Shared" },

  "requisition-new-rf": { label: "New requisition", href: "/requisitions/new", group: "Requisition" },
  "requisition-my-requests": { label: "My requests", href: "/requisitions", group: "Requisition" },
  "requisition-approval-queue": { label: "Approval queue", href: "/requisitions/approvals", group: "Requisition" },

  "inventory-item-list": { label: "Items", href: "/inventory/items", group: "Inventory" },
  "inventory-stock-detail-and-movements": { label: "Stock detail and movements", href: "/inventory/items", group: "Inventory", inMenu: false },
  "inventory-issue-queue": { label: "Issue queue", href: "/inventory/issue-queue", group: "Inventory" },
  "inventory-ar-preparation": { label: "AR preparation", href: "/inventory/ar-preparation", group: "Inventory" },
  "inventory-dispatch": { label: "Dispatch", href: "/inventory/dispatch", group: "Inventory" },
  "inventory-adjustments": { label: "Adjustments", href: "/inventory/adjustments", group: "Inventory" },
  "inventory-sales-deductions": { label: "Sales deductions", href: "/inventory/sales-deductions", group: "Inventory" },
  "inventory-low-stock-review": { label: "Low-stock review", href: "/inventory/low-stock", group: "Inventory" },

  "purchasing-supplier-list": { label: "Suppliers", href: "/purchasing/suppliers", group: "Purchasing" },
  "purchasing-pr-queue": { label: "PR queue", href: "/purchasing/requisitions", group: "Purchasing" },
  "purchasing-po-editor": { label: "Purchase orders", href: "/purchasing/orders", group: "Purchasing" },
  "purchasing-accounting-review": { label: "Accounting review", href: "/purchasing/accounting-review", group: "Purchasing" },
  "purchasing-open-po-follow-up": { label: "Open PO follow-up", href: "/purchasing/open-orders", group: "Purchasing" },

  "delivery-receiving-queue": { label: "Receiving queue", href: "/delivery/receiving", group: "Delivery" },
  "delivery-receipt-inspection": { label: "Receipt inspection", href: "/delivery/receipt-inspection", group: "Delivery" },
  "delivery-sdr": { label: "Supplier discrepancies", href: "/delivery/sdr", group: "Delivery" },
  "delivery-internal-delivery-queue": { label: "Internal delivery queue", href: "/delivery/internal", group: "Delivery" },
  "delivery-acceptance-and-ar-signing": { label: "Acceptance and AR signing", href: "/delivery/acceptance", group: "Delivery" },
  "delivery-rdr": { label: "Requester discrepancies", href: "/delivery/rdr", group: "Delivery" },
  "delivery-return-inspection": { label: "Return inspection", href: "/delivery/return-inspection", group: "Delivery" },
};

const menuEntries = (
  Object.entries(screenRoutes) as [Exclude<AppScreen, "login">, ScreenRoute][]
).filter(([, route]) => route.inMenu !== false);

/** The menu for one role: only the screens that role may use, in groups. */
export function getNavigationForRole(role: AppRole): NavigationGroup[] {
  const groups: NavigationGroup[] = [];

  for (const [screen, route] of menuEntries) {
    if (!roleCanAccessScreen(role, screen)) {
      continue;
    }

    let group = groups.find((candidate) => candidate.title === route.group);

    if (!group) {
      group = { title: route.group, items: [] };
      groups.push(group);
    }

    group.items.push({
      screen,
      label: route.label,
      href: route.href,
      isBuilt: builtScreens.includes(screen),
    });
  }

  return groups;
}

/** The menu screen served at a path, used by the placeholder page. */
export function findScreenByPath(
  path: string,
): { screen: AppScreen; label: string } | null {
  const entry = menuEntries.find(([, route]) => route.href === path);

  return entry ? { screen: entry[0], label: entry[1].label } : null;
}
