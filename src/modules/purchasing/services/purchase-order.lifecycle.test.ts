import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderRevisions,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockMovements,
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

import { createPurchaseOrderService } from "./purchase-order.create.service";
import { listPurchaseOrdersForReceivingService } from "./purchase-order.lists.service";
import { placePurchaseOrderService } from "./purchase-order.place.service";
import {
  approvePurchaseOrderService,
  returnPurchaseOrderService,
} from "./purchase-order.review.service";
import { updatePurchaseOrderService } from "./purchase-order.update.service";
import { listOpenPurchaseRequisitionsService } from "./purchase-requisition.lists.service";

describeWithDatabase("purchase order lifecycle", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function setupShortagePr() {
    const itemId = await createItem("PO-LIFE-1", "0");
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

    return {
      supplierId: supplier.supplierId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
      requisitionId: request.requisitionId,
    };
  }

  it("runs the shortage PR through draft, return, revision, approval, and placement", async () => {
    const source = await setupShortagePr();

    const { purchaseOrderId } = await createPurchaseOrderService(
      people.purchasing_staff,
      {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: "Deliver to Bay 2",
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "6",
            unitPrice: "1500",
          },
        ],
      },
    );

    const [draft] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    expect(draft).toMatchObject({
      status: "pending_approval",
      currentVersion: 1,
      preparedBy: people.purchasing_staff.userId,
    });

    const [openPr] = await db
      .select({ status: purchaseRequisitions.status })
      .from(purchaseRequisitions)
      .where(
        eq(purchaseRequisitions.purchaseRequisitionId, source.purchaseRequisitionId),
      );
    expect(openPr.status).toBe("open");

    const accountingAlerts = await db.select().from(notifications);
    expect(accountingAlerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.accounting_associate.userId,
        notificationType: "purchase_order_pending_approval",
      }),
    );

    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId,
      reason: "Please confirm the delivered quantity.",
    });

    const [returned] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    expect(returned.status).toBe("for_revision");

    await expect(
      placePurchaseOrderService(people.purchasing_staff, { purchaseOrderId }),
    ).rejects.toThrow("Only an approved purchase order");

    const revision = await updatePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId,
      supplierId: source.supplierId,
      deliveryTerms: "Deliver to Bay 2",
      lines: [
        {
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          orderedQty: "10",
          unitPrice: "1600",
        },
      ],
    });
    expect(revision.versionNo).toBe(2);

    const [revised] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    expect(revised).toMatchObject({
      status: "pending_approval",
      currentVersion: 2,
      approvedBy: null,
      approvedAt: null,
    });

    const storedRevisions = await db
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId))
      .orderBy(asc(purchaseOrderRevisions.versionNo));
    expect(storedRevisions).toHaveLength(2);
    expect(storedRevisions[0]).toMatchObject({
      versionNo: 1,
      budgetOk: false,
      reviewReason: "Please confirm the delivered quantity.",
    });
    expect(storedRevisions[1]).toMatchObject({ versionNo: 2, budgetOk: null });

    await approvePurchaseOrderService(people.accounting_associate, { purchaseOrderId });

    const [approved] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    expect(approved).toMatchObject({
      status: "approved",
      approvedBy: people.accounting_associate.userId,
    });
    expect(approved.approvedAt).not.toBeNull();

    const [covered] = await db
      .select({ status: purchaseRequisitions.status })
      .from(purchaseRequisitions)
      .where(
        eq(purchaseRequisitions.purchaseRequisitionId, source.purchaseRequisitionId),
      );
    expect(covered.status).toBe("covered");

    const openRequests = await listOpenPurchaseRequisitionsService();
    expect(openRequests.map((pr) => pr.purchaseRequisitionId)).not.toContain(
      source.purchaseRequisitionId,
    );

    const placed = await placePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId,
    });
    expect(placed).toEqual({ purchaseOrderId, status: "placed" });

    const [finalOrder] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    expect(finalOrder.status).toBe("placed");
    expect(finalOrder.orderedAt).not.toBeNull();

    const receiving = await listPurchaseOrdersForReceivingService(
      people.delivery_operations,
    );
    expect(receiving.map((order) => order.purchaseOrderId)).toContain(purchaseOrderId);

    expect(await db.select().from(stockMovements)).toHaveLength(0);

    const audits = await db.select().from(auditLog);
    for (const action of [
      "purchase_order.create",
      "purchase_order.return",
      "purchase_order.revise",
      "purchase_order.approve",
      "purchase_order.place",
      "purchase_requisition.cover",
    ]) {
      expect(audits).toContainEqual(
        expect.objectContaining({ action, entityType: expect.any(String) }),
      );
    }
  });
});
