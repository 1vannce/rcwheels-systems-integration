import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderLines,
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

import { createPurchaseOrderService } from "./purchase-order.create.service";

describeWithDatabase("purchase order create service", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  async function setupOpenPr(options: { status?: "open" | "covered" | "cancelled"; quantity?: string } = {}) {
    const itemId = await createItem("PO-SVC-1", "0");
    const request = await createRequisitionLine(
      people.requester.userId,
      itemId,
      options.quantity ?? "10",
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
        status: options.status ?? "open",
      })
      .returning();
    const [line] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: pr.purchaseRequisitionId,
        requisitionLineId: request.requisitionLineId,
        itemId,
        requestedQty: options.quantity ?? "10",
      })
      .returning();

    return {
      itemId,
      supplierId: supplier.supplierId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
      requisitionId: request.requisitionId,
    };
  }

  it("creates a pending PO with version 1, audit, and Accounting notification", async () => {
    const source = await setupOpenPr();

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

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
    const [line] = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));
    const [revision] = await db
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, purchaseOrderId));

    expect(header).toMatchObject({
      supplierId: source.supplierId,
      preparedBy: people.purchasing_staff.userId,
      status: "pending_approval",
      currentVersion: 1,
      deliveryTerms: "Deliver to Bay 2",
    });
    expect(line).toMatchObject({
      purchaseRequisitionLineId: source.purchaseRequisitionLineId,
      orderedQty: "6.000",
      unitPrice: "1500.00",
    });
    expect(revision).toMatchObject({
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      budgetOk: null,
    });
    expect(JSON.parse(revision.snapshot)).toMatchObject({
      supplier: { supplierId: source.supplierId, supplierName: "Sugbo Tire Trading" },
      deliveryTerms: "Deliver to Bay 2",
      lines: [{ purchaseRequisitionLineId: source.purchaseRequisitionLineId, orderedQty: "6" }],
    });

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.accounting_associate.userId,
        notificationType: "purchase_order_pending_approval",
        requisitionId: source.requisitionId,
      }),
    );

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_order.create",
        entityId: purchaseOrderId,
      }),
    );
  });

  it("refuses a non-positive unit price at the service boundary", async () => {
    const source = await setupOpenPr();

    await expect(
      createPurchaseOrderService(people.purchasing_staff, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "0",
          },
        ],
      }),
    ).rejects.toThrow("unit price must be above zero");
  });

  it("refuses a quantity above the PR line's remaining quantity", async () => {
    const source = await setupOpenPr();

    await expect(
      createPurchaseOrderService(people.purchasing_staff, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "11",
            unitPrice: "1500",
          },
        ],
      }),
    ).rejects.toThrow("remains to order");

    expect(await db.select().from(purchaseOrders)).toHaveLength(0);
  });

  it("refuses a missing supplier", async () => {
    const source = await setupOpenPr();

    await expect(
      createPurchaseOrderService(people.purchasing_staff, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: 999999,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "1500",
          },
        ],
      }),
    ).rejects.toThrow("supplier no longer exists");
  });

  it("refuses a PR that is not open", async () => {
    const source = await setupOpenPr({ status: "covered" });

    await expect(
      createPurchaseOrderService(people.purchasing_staff, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "1500",
          },
        ],
      }),
    ).rejects.toThrow("Only an open purchase request");
  });

  it("refuses duplicate PR lines even if called outside the form DTO", async () => {
    const source = await setupOpenPr();

    await expect(
      createPurchaseOrderService(people.purchasing_staff, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "1500",
          },
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "1600",
          },
        ],
      }),
    ).rejects.toThrow("may appear only once");
  });

  it("blocks another role and audits the refusal", async () => {
    const source = await setupOpenPr();

    await expect(
      createPurchaseOrderService(people.requester, {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: source.purchaseRequisitionLineId,
            orderedQty: "1",
            unitPrice: "1500",
          },
        ],
      }),
    ).rejects.toThrow("Only Purchasing Staff");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "blocked:purchase_order.create")));
    expect(audits).toHaveLength(1);
    expect(audits[0].actorUserId).toBe(people.requester.userId);
  });
});
