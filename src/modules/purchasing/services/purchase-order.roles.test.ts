import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  suppliers,
} from "@/db/schema";
import { appRoles, type AppRole, type AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, createRequisitionLine } from "@/test/stock-fixtures";

import { cancelPurchaseOrderBalanceService } from "./purchase-order.cancel.service";
import { createPurchaseOrderService } from "./purchase-order.create.service";
import { discardPurchaseOrderDraftService } from "./purchase-order.discard.service";
import { placePurchaseOrderService } from "./purchase-order.place.service";
import {
  approvePurchaseOrderService,
  returnPurchaseOrderService,
} from "./purchase-order.review.service";
import { updatePurchaseOrderService } from "./purchase-order.update.service";

const nonPurchasingRoles = appRoles.filter((role) => role !== "purchasing_staff");
const nonAccountingRoles = appRoles.filter((role) => role !== "accounting_associate");

describeWithDatabase("purchase order role boundaries", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function setupOpenPr() {
    const itemId = await createItem("PO-ROLE-1", "0");
    const request = await createRequisitionLine(
      people.requester.userId,
      itemId,
      "10",
    );
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
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

    return {
      supplierId: supplier.supplierId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
    };
  }

  async function setupPendingPo(source: Awaited<ReturnType<typeof setupOpenPr>>) {
    const { purchaseOrderId } = await createPurchaseOrderService(
      people.purchasing_staff,
      {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "10",
            unitPrice: "1500",
          },
        ],
      },
    );

    return purchaseOrderId;
  }

  it("lets Purchasing Staff prepare and place while Accounting approves", async () => {
    const source = await setupOpenPr();
    const purchaseOrderId = await setupPendingPo(source);

    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId,
      reason: "Budget approved.",
    });
    await placePurchaseOrderService(people.purchasing_staff, { purchaseOrderId });

    const [header] = await db
      .select({ status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    expect(header.status).toBe("placed");
  });

  it("lets Accounting return and Purchasing Staff resubmit a revision", async () => {
    const source = await setupOpenPr();
    const purchaseOrderId = await setupPendingPo(source);

    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId,
      reason: "Use the other supplier quote.",
    });

    const revision = await updatePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId,
      supplierId: source.supplierId,
      deliveryTerms: null,
      lines: [
        {
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          orderedQty: "10",
          unitPrice: "1400",
        },
      ],
    });
    expect(revision.versionNo).toBe(2);

    const [header] = await db
      .select({ status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    expect(header.status).toBe("pending_approval");
  });

  it.each(nonPurchasingRoles)(
    "blocks %s from preparing, revising, placing, or discarding a PO",
    async (role) => {
      const actor = people[role];

      await expect(
        createPurchaseOrderService(actor, {
          purchaseRequisitionId: 999999,
          supplierId: 999999,
          deliveryTerms: null,
          lines: [
            {
              purchaseRequisitionLineId: 999999,
              orderedQty: "1",
              unitPrice: "1",
            },
          ],
        }),
      ).rejects.toThrow("Only Purchasing Staff");

      await expect(
        updatePurchaseOrderService(actor, {
          purchaseOrderId: 999999,
          supplierId: 999999,
          deliveryTerms: null,
          lines: [
            {
              purchaseRequisitionLineId: 999999,
              orderedQty: "1",
              unitPrice: "1",
            },
          ],
        }),
      ).rejects.toThrow("Only Purchasing Staff");

      await expect(
        placePurchaseOrderService(actor, { purchaseOrderId: 999999 }),
      ).rejects.toThrow("Only Purchasing Staff");

      await expect(
        discardPurchaseOrderDraftService(actor, { purchaseOrderId: 999999 }),
      ).rejects.toThrow("Only Purchasing Staff");
    },
  );

  it.each(nonAccountingRoles)(
    "blocks %s from approving, returning, or cancelling a PO",
    async (role) => {
      const actor = people[role];

      await expect(
        approvePurchaseOrderService(actor, {
          purchaseOrderId: 999999,
          reason: "Budget approved.",
        }),
      ).rejects.toThrow("Only the Accounting Associate");

      await expect(
        returnPurchaseOrderService(actor, {
          purchaseOrderId: 999999,
          reason: "Not budgeted.",
        }),
      ).rejects.toThrow("Only the Accounting Associate");

      await expect(
        cancelPurchaseOrderBalanceService(actor, {
          purchaseOrderId: 999999,
          reason: "Not allowed.",
        }),
      ).rejects.toThrow("Only the Accounting Associate");
    },
  );
});
