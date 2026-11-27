import "server-only";

import {
  countPendingDeliveries,
  countUnresolvedSupplierDiscrepancies,
} from "@/modules/delivery";
import { countItemsAtReorderPoint } from "@/modules/inventory";
import {
  countOpenPurchaseRequisitionsService,
  countPurchaseOrdersService,
} from "@/modules/purchasing";
import { countRequisitionsService, requisitionStatuses } from "@/modules/requisition";

import type { DashboardCard } from "../types/dashboard.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";

// Read-only counts for the role-based dashboard (PLAN section 2). Unlike the
// rest of core, this service reads from the modules above it, only through
// their index.ts exports. That closes an import cycle, so call those exports
// only inside a card's count function, never while this file loads.
// A card links only to a built screen its role can open.

type CardLoader = (user: AppUser) => Promise<DashboardCard>;

function card(
  label: string,
  href: string | null,
  count: (user: AppUser) => Promise<number>,
): CardLoader {
  return async (user) => ({ label, href, count: await count(user) });
}

const itemsToReorder = card("Items at or below reorder point", "/inventory/items", () =>
  countItemsAtReorderPoint(),
);

const awaitingStock = (href: string) =>
  card("Requisitions awaiting stock", href, () =>
    countRequisitionsService({ statuses: ["awaiting_stock"] }),
  );

const openPurchaseRequests = card("Open purchase requests", "/purchasing/requisitions", () =>
  countOpenPurchaseRequisitionsService(),
);

const receivingQueue = card("Purchase orders waiting for receiving", "/delivery/receiving", () =>
  countPurchaseOrdersService(["placed", "partially_received"]),
);

const ordersAwaitingReview = card(
  "Purchase orders awaiting review",
  "/purchasing/accounting-review",
  () => countPurchaseOrdersService(["pending_approval"]),
);

// No link yet: the supplier discrepancy screen is not built, and Purchasing
// cannot open it.
const unresolvedSdrs = card("Unresolved supplier discrepancies", null, (user) =>
  countUnresolvedSupplierDiscrepancies(user),
);

const cardsByRole: Record<AppRole, readonly CardLoader[]> = {
  requester: [
    card("My open requisitions", "/requisitions/my-requests", (user) =>
      countRequisitionsService({
        submitterOrRequesterUserId: user.userId,
        statuses: requisitionStatuses.filter(
          (status) => !["fulfilled", "rejected", "cancelled"].includes(status),
        ),
      }),
    ),
    card("Deliveries awaiting my acceptance", "/delivery/acceptance", (user) =>
      countPendingDeliveries({ recipientUserId: user.userId }),
    ),
  ],
  requisition_approver: [
    card("Requisitions awaiting my approval", "/requisitions/approvals", (user) =>
      countRequisitionsService({ approverId: user.userId, statuses: ["pending_approval"] }),
    ),
    card("Delivered, awaiting Fulfilled", "/requisitions", (user) =>
      countRequisitionsService({ approverId: user.userId, statuses: ["delivered"] }),
    ),
  ],
  inventory_custodian: [
    itemsToReorder,
    awaitingStock("/inventory/issue-queue"),
    receivingQueue,
    unresolvedSdrs,
  ],
  // The Manager has no receiving or SDR screen, so those counts are left out.
  inventory_manager: [itemsToReorder, awaitingStock("/requisitions")],
  purchasing_staff: [
    openPurchaseRequests,
    // A new PO goes straight to Accounting; there is no draft status.
    card("Purchase orders returned by Accounting", "/purchasing/orders", () =>
      countPurchaseOrdersService(["for_revision"]),
    ),
    unresolvedSdrs,
  ],
  accounting_associate: [ordersAwaitingReview],
  delivery_operations: [
    card("Internal deliveries not yet signed", "/delivery/internal", () =>
      countPendingDeliveries(),
    ),
    receivingQueue,
  ],
  system_administrator: [
    card("Requisitions awaiting approval", "/requisitions", () =>
      countRequisitionsService({ statuses: ["pending_approval"] }),
    ),
    awaitingStock("/requisitions"),
    itemsToReorder,
    openPurchaseRequests,
    ordersAwaitingReview,
    receivingQueue,
  ],
};

/** The signed-in user's cards. Counts only; nothing is written. */
export async function getDashboardCards(user: AppUser): Promise<DashboardCard[]> {
  return Promise.all(cardsByRole[user.role].map((load) => load(user)));
}
