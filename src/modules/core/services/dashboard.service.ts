import "server-only";

import {
  countUnresolvedSupplierDiscrepancies,
  listDeliveriesToAccept,
  listInternalDeliveryQueue,
} from "@/modules/delivery";
import { countItemsAtReorderPoint } from "@/modules/inventory";
import {
  countPurchaseOrdersService,
  listOpenPurchaseRequisitionsService,
  listPurchaseOrdersForReceivingService,
} from "@/modules/purchasing";
import { countRequisitionsService, requisitionStatuses } from "@/modules/requisition";

import type { DashboardCard } from "../types/dashboard.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";

// Read-only counts for the role-based dashboard (PLAN section 2). Unlike the
// rest of core, this service reads from the modules above it, only through
// their index.ts exports. A card links to a screen its role can open.

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

// The queue lists below stop at 100 rows, so their counts do too.
const openPurchaseRequests = card(
  "Open purchase requests",
  "/purchasing/requisitions",
  async () => (await listOpenPurchaseRequisitionsService()).length,
);

const receivingQueue = card(
  "Purchase orders waiting for receiving",
  "/delivery/receiving",
  async (user) => (await listPurchaseOrdersForReceivingService(user)).length,
);

const ordersAwaitingReview = card(
  "Purchase orders awaiting review",
  "/purchasing/accounting-review",
  () => countPurchaseOrdersService(["pending_approval"]),
);

const unresolvedSdrs = (href: string | null) =>
  card("Unresolved supplier discrepancies", href, countUnresolvedSupplierDiscrepancies);

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
    card(
      "Deliveries awaiting my acceptance",
      "/delivery/acceptance",
      async (user) => (await listDeliveriesToAccept(user)).length,
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
    unresolvedSdrs("/delivery/sdr"),
  ],
  // The Manager has no receiving or SDR screen, so those counts are left out.
  inventory_manager: [itemsToReorder, awaitingStock("/requisitions")],
  purchasing_staff: [
    openPurchaseRequests,
    // A new PO goes straight to Accounting; there is no draft status.
    card("Purchase orders returned by Accounting", "/purchasing/orders", () =>
      countPurchaseOrdersService(["for_revision"]),
    ),
    // Purchasing has no supplier discrepancy screen to link to.
    unresolvedSdrs(null),
  ],
  accounting_associate: [ordersAwaitingReview],
  delivery_operations: [
    card(
      "Internal deliveries not yet signed",
      "/delivery/internal",
      async () => (await listInternalDeliveryQueue()).length,
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
