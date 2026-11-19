import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderRevisions,
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
import {
  approvePurchaseOrderService,
  returnPurchaseOrderService,
} from "./purchase-order.review.service";

describeWithDatabase("purchase order review service", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function setupPendingPo(preparedBy = people.purchasing_staff.userId) {
    const itemId = await createItem("PO-REVIEW-1", "0");
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
      preparedBy,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: "6",
        unitPrice: "1500",
      },
    ]);
    await insertPurchaseOrderRevision(db, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: preparedBy,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
            itemId,
            itemCode: "PO-REVIEW-1",
            itemName: "Test PO-REVIEW-1",
            unit: "pc",
            orderedQty: "6",
            unitPrice: "1500",
          },
        ],
      }),
    });

    return { purchaseOrderId };
  }

  it("approves the current version and records the Accounting review", async () => {
    const { purchaseOrderId } = await setupPendingPo();

    await approvePurchaseOrderService(people.accounting_associate, { purchaseOrderId });

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    const [revision] = await db
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId));

    expect(header).toMatchObject({
      status: "approved",
      approvedBy: people.accounting_associate.userId,
    });
    expect(header.approvedAt).not.toBeNull();
    expect(revision).toMatchObject({
      budgetOk: true,
      reviewedBy: people.accounting_associate.userId,
      reviewReason: null,
    });
    expect(revision.reviewedAt).not.toBeNull();

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "purchase_order.approve", entityId: purchaseOrderId }),
    );

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "purchase_order_approved",
      }),
    );
  });

  it("returns the current version with a reason and notifies the preparer", async () => {
    const { purchaseOrderId } = await setupPendingPo();

    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId,
      reason: "Budget is not available this month.",
    });

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    const [revision] = await db
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId));

    expect(header).toMatchObject({
      status: "for_revision",
      approvedBy: null,
      approvedAt: null,
    });
    expect(revision).toMatchObject({
      budgetOk: false,
      reviewedBy: people.accounting_associate.userId,
      reviewReason: "Budget is not available this month.",
    });

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "purchase_order_returned",
      }),
    );
  });

  it("blocks self-approval", async () => {
    const { purchaseOrderId } = await setupPendingPo(people.accounting_associate.userId);

    await expect(
      approvePurchaseOrderService(people.accounting_associate, { purchaseOrderId }),
    ).rejects.toThrow("cannot approve a purchase order you prepared");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "blocked:purchase_order.approve")));
    expect(audits).toHaveLength(1);
  });

  it("blocks a second review once the PO is no longer pending", async () => {
    const { purchaseOrderId } = await setupPendingPo();
    await approvePurchaseOrderService(people.accounting_associate, { purchaseOrderId });

    await expect(
      returnPurchaseOrderService(people.accounting_associate, {
        purchaseOrderId,
        reason: "Too late to return.",
      }),
    ).rejects.toThrow("waiting for Accounting");
  });

  it("blocks another role from reviewing", async () => {
    const { purchaseOrderId } = await setupPendingPo();

    await expect(
      approvePurchaseOrderService(people.purchasing_staff, { purchaseOrderId }),
    ).rejects.toThrow("Only the Accounting Associate");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "blocked:purchase_order.approve")));
    expect(audits).toHaveLength(1);
  });

  it("refuses a return reason that is too short when called outside the DTO", async () => {
    const { purchaseOrderId } = await setupPendingPo();

    await expect(
      returnPurchaseOrderService(people.accounting_associate, {
        purchaseOrderId,
        reason: "no",
      }),
    ).rejects.toThrow("Give a reason");
  });
});
