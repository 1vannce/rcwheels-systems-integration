import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  items,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitions,
  requisitions,
  supplierDiscrepancies,
  suppliers,
} from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import {
  createItem,
  createRequisitionLine,
  createSupplierReceiptLine,
} from "@/test/stock-fixtures";

import { appRoles, type AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { getDashboardCards } from "./dashboard.service";
import { findScreenByPath } from "./navigation.service";
import { roleCanAccessScreen } from "./role-access.service";

const SDR = "Unresolved supplier discrepancies";

const expectedLabels: Record<AppRole, string[]> = {
  requester: ["My open requisitions", "Deliveries awaiting my acceptance"],
  requisition_approver: ["Requisitions awaiting my approval", "Delivered, awaiting Fulfilled"],
  inventory_custodian: [
    "Items at or below reorder point",
    "Requisitions awaiting stock",
    "Purchase orders waiting for receiving",
    SDR,
  ],
  inventory_manager: ["Items at or below reorder point", "Requisitions awaiting stock"],
  purchasing_staff: ["Open purchase requests", "Purchase orders returned by Accounting", SDR],
  accounting_associate: ["Purchase orders awaiting review"],
  delivery_operations: [
    "Internal deliveries not yet signed",
    "Purchase orders waiting for receiving",
  ],
  system_administrator: [
    "Requisitions awaiting approval",
    "Requisitions awaiting stock",
    "Items at or below reorder point",
    "Open purchase requests",
    "Purchase orders awaiting review",
    "Purchase orders waiting for receiving",
  ],
};

describeWithDatabase("dashboard cards", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function counts(role: AppRole) {
    const cards = await getDashboardCards(people[role]);

    return Object.fromEntries(cards.map((card) => [card.label, card.count]));
  }

  async function itemWithPoint(code: string, onHand: string, reorderPoint: string) {
    const itemId = await createItem(code, onHand);
    await db.update(items).set({ reorderPoint }).where(eq(items.itemId, itemId));
  }

  /** One PO per status, an SDR per status, and open and covered PRs. */
  async function seed() {
    // Counted: below the point and exactly at it. Not counted: above, or no point.
    await itemWithPoint("DB-BELOW", "3", "5");
    await itemWithPoint("DB-AT", "5", "5");
    await itemWithPoint("DB-ABOVE", "6", "5");
    await itemWithPoint("DB-NOPOINT", "0", "0");

    const itemId = await createItem("DB-REQ");
    for (const status of ["awaiting_stock", "awaiting_stock", "approved"] as const) {
      const { requisitionId } = await createRequisitionLine(
        people.requester.userId,
        itemId,
        "1",
      );
      await db
        .update(requisitions)
        .set({ status })
        .where(eq(requisitions.requisitionId, requisitionId));
    }

    // Leaves one open PR and one PO line to hang the other rows on.
    await createSupplierReceiptLine(people.purchasing_staff.userId, itemId, "10", "100");
    await db.insert(purchaseRequisitions).values(
      (["open", "covered"] as const).map((status) => ({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage" as const,
        status,
      })),
    );

    const [poLine] = await db.select().from(purchaseOrderLines);
    const [supplier] = await db.select().from(suppliers);
    await db
      .update(purchaseOrders)
      .set({ status: "closed" })
      .where(eq(purchaseOrders.purchaseOrderId, poLine.purchaseOrderId));
    await db.insert(purchaseOrders).values(
      (
        [
          "placed",
          "partially_received",
          "for_revision",
          "for_revision",
          "for_revision",
          "pending_approval",
        ] as const
      ).map((status) => ({
        supplierId: supplier.supplierId,
        preparedBy: people.purchasing_staff.userId,
        status,
      })),
    );

    await db.insert(supplierDiscrepancies).values(
      (["open", "agreed", "resolved"] as const).map((status) => ({
        purchaseOrderLineId: poLine.purchaseOrderLineId,
        reportedBy: people.inventory_custodian.userId,
        problem: "Test",
        affectedQty: "1",
        status,
      })),
    );
  }

  it.each(appRoles)("gives the %s only its own cards, linked to screens it can open", async (role) => {
    const cards = await getDashboardCards(people[role]);

    expect(cards.map((card) => card.label)).toEqual(expectedLabels[role]);

    for (const card of cards) {
      expect(card.count).toBe(0);

      if (card.href !== null) {
        const screen = findScreenByPath(card.href);
        expect(screen && roleCanAccessScreen(role, screen.screen)).toBe(true);
      }
    }
  });

  it("counts the seeded rows for the Inventory Custodian", async () => {
    await seed();

    expect(await counts("inventory_custodian")).toEqual({
      "Items at or below reorder point": 2,
      "Requisitions awaiting stock": 2,
      "Purchase orders waiting for receiving": 2,
      [SDR]: 2,
    });
  });

  it("counts the seeded rows for Purchasing", async () => {
    await seed();

    expect(await counts("purchasing_staff")).toEqual({
      "Open purchase requests": 2,
      "Purchase orders returned by Accounting": 3,
      [SDR]: 2,
    });
  });
});
