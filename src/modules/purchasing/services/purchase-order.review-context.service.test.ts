import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  purchaseOrderLines,
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
  insertPurchaseOrderRevision,
} from "../repositories/purchase-order.repository";
import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";
import { getPurchaseOrderReviewContextService } from "./purchase-order.review-context.service";

describeWithDatabase("purchase order review context service", () => {
  let people: Record<AppRole, AppUser>;
  let sequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    sequence = 0;
  });

  afterAll(closeDatabase);

  async function setupPo(
    options: { version?: 1 | 2; malformedCurrent?: boolean } = {},
  ) {
    sequence += 1;
    const itemCode = `PO-CTX-${sequence}`;
    const itemId = await createItem(itemCode, "0");
    const request = await createRequisitionLine(
      people.requester.userId,
      itemId,
      "10",
    );
    const [supplier] = await db
      .insert(suppliers)
      .values({
        supplierName: "Sugbo Tire Trading",
        contactPerson: "Elena Ramos",
        contactDetails: "elena@sugbotire.test",
        address: "Mandaue City, Cebu",
      })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "open",
      })
      .returning();
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty: "10",
      })
      .returning();
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: supplier.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: "Deliver to Bay 2",
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: "6",
        unitPrice: "1500",
      },
    ]);

    const snapshotLine = {
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
      itemId,
      itemCode,
      itemName: `Test ${itemCode}`,
      unit: "pc",
      orderedQty: "6",
      unitPrice: "1500",
    };

    await insertPurchaseOrderRevision(db, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: "Deliver to Bay 2",
        lines: [snapshotLine],
      }),
    });

    let revisedSupplier = supplier;

    if (options.version === 2 || options.malformedCurrent) {
      const [secondSupplier] = await db
        .insert(suppliers)
        .values({
          supplierName: "Cebu Parts Depot",
          contactPerson: "Mark Lim",
          contactDetails: "mark@cebuparts.test",
          address: "Cebu City",
        })
        .returning();

      revisedSupplier = secondSupplier;

      await db
        .update(purchaseOrders)
        .set({ currentVersion: 2, supplierId: secondSupplier.supplierId })
        .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
      await db
        .update(purchaseOrderLines)
        .set({ orderedQty: "4", unitPrice: "1600" })
        .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));

      await insertPurchaseOrderRevision(db, {
        purchaseOrderId,
        versionNo: 2,
        changedBy: people.purchasing_staff.userId,
        snapshot: options.malformedCurrent
          ? "{not json"
          : serializePurchaseOrderSnapshot({
              supplier: secondSupplier,
              deliveryTerms: "Deliver to Bay 4",
              lines: [
                {
                  ...snapshotLine,
                  orderedQty: "4",
                  unitPrice: "1600",
                },
              ],
            }),
      });
    }

    return {
      purchaseOrderId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
      revisedSupplier,
    };
  }

  it("returns the PO, supplier, source PR, and version diff for Accounting", async () => {
    const source = await setupPo({ version: 2 });

    const context = await getPurchaseOrderReviewContextService(
      people.accounting_associate,
      source.purchaseOrderId,
    );

    expect(context).not.toBeNull();
    expect(context?.order.currentVersion).toBe(2);
    expect(context?.supplier).toMatchObject({
      supplierId: source.revisedSupplier.supplierId,
      supplierName: "Cebu Parts Depot",
      contactPerson: "Mark Lim",
    });
    expect(context?.sourcePurchaseRequisition).toMatchObject({
      purchaseRequisitionId: source.purchaseRequisitionId,
      requestedByName: "Test requester",
      requestReason: "shortage",
      status: "open",
    });
    expect(context?.snapshotUnavailable).toBe(false);
    expect(context?.versionDiff).toMatchObject({
      hasChanges: true,
      supplierChanged: true,
      previousSupplierName: "Sugbo Tire Trading",
      supplierName: "Cebu Parts Depot",
      deliveryTermsChanged: true,
      lineChanges: [
        expect.objectContaining({
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          change: "changed",
          previousOrderedQty: "6",
          orderedQty: "4",
          previousUnitPrice: "1500",
          unitPrice: "1600",
        }),
      ],
    });
  });

  it("allows the system administrator to read the context", async () => {
    const source = await setupPo();

    const context = await getPurchaseOrderReviewContextService(
      people.system_administrator,
      source.purchaseOrderId,
    );

    expect(context).not.toBeNull();
  });

  it.each(["purchasing_staff", "requester", "inventory_custodian"] as const)(
    "returns null for %s",
    async (role) => {
      const source = await setupPo();

      await expect(
        getPurchaseOrderReviewContextService(
          people[role],
          source.purchaseOrderId,
        ),
      ).resolves.toBeNull();
    },
  );

  it("returns no diff for the first version", async () => {
    const source = await setupPo();

    const context = await getPurchaseOrderReviewContextService(
      people.accounting_associate,
      source.purchaseOrderId,
    );

    expect(context?.versionDiff).toBeNull();
    expect(context?.snapshotUnavailable).toBe(false);
  });

  it("does not fail when the current snapshot is malformed", async () => {
    const source = await setupPo({ malformedCurrent: true });

    const context = await getPurchaseOrderReviewContextService(
      people.accounting_associate,
      source.purchaseOrderId,
    );

    expect(context?.snapshotUnavailable).toBe(true);
    expect(context?.versionDiff).toBeNull();
  });

  it("returns null for a missing purchase order", async () => {
    await expect(
      getPurchaseOrderReviewContextService(people.accounting_associate, 999999),
    ).resolves.toBeNull();
  });
});
