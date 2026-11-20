import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  suppliers,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, createRequisitionLine } from "@/test/stock-fixtures";

import {
  insertPurchaseOrder,
  insertPurchaseOrderLines,
} from "../repositories/purchase-order.repository";
import {
  getPurchaseOrderFormContextService,
  listPendingPurchaseOrdersService,
  listPurchaseOrdersService,
} from "./purchase-order.lists.service";

describeWithDatabase("purchase order list services", () => {
  let people: Record<AppRole, AppUser>;
  let itemSequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    itemSequence = 0;
  });

  afterAll(closeDatabase);

  async function setupOpenPr(options: { status?: "open" | "covered" } = {}) {
    itemSequence += 1;
    const itemId = await createItem(`PO-LIST-${itemSequence}`, "0");
    const request = await createRequisitionLine(people.requester.userId, itemId, "10");
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: options.status ?? "open",
      })
      .returning();
    const [line] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty: "10",
      })
      .returning();

    return {
      supplierId: supplier.supplierId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
    };
  }

  async function createDraft(source: Awaited<ReturnType<typeof setupOpenPr>>) {
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: source.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: "4",
        unitPrice: "1500",
      },
    ]);

    return purchaseOrderId;
  }

  it("builds the PO form context from an open PR", async () => {
    const source = await setupOpenPr();
    await createDraft(source);

    const context = await getPurchaseOrderFormContextService(
      people.purchasing_staff,
      source.purchaseRequisitionId,
    );

    expect(context).not.toBeNull();
    expect(context?.purchaseRequisition).toMatchObject({
      purchaseRequisitionId: source.purchaseRequisitionId,
      requestedByName: people.inventory_custodian.fullName,
      status: "open",
    });
    expect(context?.lines).toHaveLength(1);
    expect(context?.lines[0]).toMatchObject({
      requestedQty: "10.000",
      allocatedQty: "4.000",
      remainingQty: "6.000",
    });
    expect(context?.suppliers).toContainEqual(
      expect.objectContaining({ supplierName: "Sugbo Tire Trading" }),
    );
  });

  it("does not build context for a closed PR or another role", async () => {
    const source = await setupOpenPr({ status: "covered" });

    await expect(
      getPurchaseOrderFormContextService(
        people.purchasing_staff,
        source.purchaseRequisitionId,
      ),
    ).resolves.toBeNull();

    const openSource = await setupOpenPr();
    await expect(
      getPurchaseOrderFormContextService(
        people.accounting_associate,
        openSource.purchaseRequisitionId,
      ),
    ).resolves.toBeNull();
  });

  it("lists only pending POs for Accounting", async () => {
    const source = await setupOpenPr();
    const pendingId = await createDraft(source);
    const approvedId = await createDraft(source);
    await db
      .update(purchaseOrders)
      .set({ status: "approved" })
      .where(eq(purchaseOrders.purchaseOrderId, approvedId));

    const pending = await listPendingPurchaseOrdersService(people.accounting_associate);
    expect(pending.map((order) => order.purchaseOrderId)).toEqual([pendingId]);

    await expect(
      listPendingPurchaseOrdersService(people.purchasing_staff),
    ).resolves.toEqual([]);
  });

  it("lists only active POs for Purchasing Staff", async () => {
    const source = await setupOpenPr();
    const pendingId = await createDraft(source);
    const cancelledId = await createDraft(source);
    await db
      .update(purchaseOrders)
      .set({ status: "cancelled" })
      .where(eq(purchaseOrders.purchaseOrderId, cancelledId));

    const orders = await listPurchaseOrdersService(people.purchasing_staff);
    expect(orders.map((order) => order.purchaseOrderId)).toEqual([pendingId]);

    await expect(listPurchaseOrdersService(people.requester)).resolves.toEqual([]);
  });
});
