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
  findPurchaseOrderLines,
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  insertPurchaseOrderRevision,
  isPurchaseOrderCurrentVersionApproved,
} from "../repositories/purchase-order.repository";
import { serializePurchaseOrderSnapshot } from "../utils/purchase-order-snapshot.util";
import {
  approvePurchaseOrderService,
  returnPurchaseOrderService,
} from "./purchase-order.review.service";
import { updatePurchaseOrderService } from "./purchase-order.update.service";

describeWithDatabase("purchase order update service", () => {
  let people: Record<AppRole, AppUser>;
  let itemSequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    itemSequence = 0;
  });

  afterAll(closeDatabase);

  async function setupPendingPo(quantity = "6") {
    itemSequence += 1;
    const itemCode = `PO-UPD-${itemSequence}`;
    const itemId = await createItem(itemCode, "0");
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
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: quantity,
        unitPrice: "1500",
      },
    ]);
    await insertPurchaseOrderRevision(db, {
      purchaseOrderId,
      versionNo: 1,
      changedBy: people.purchasing_staff.userId,
      snapshot: serializePurchaseOrderSnapshot({
        supplier,
        deliveryTerms: null,
        lines: [
          {
            purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
            itemId,
            itemCode,
            itemName: `Test ${itemCode}`,
            unit: "pc",
            orderedQty: quantity,
            unitPrice: "1500",
          },
        ],
      }),
    });

    return {
      itemId,
      itemCode,
      supplierId: supplier.supplierId,
      purchaseOrderId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
    };
  }

  async function createOtherActivePo(
    source: Awaited<ReturnType<typeof setupPendingPo>>,
    quantity: string,
  ) {
    const purchaseOrderId = await insertPurchaseOrder(db, {
      supplierId: source.supplierId,
      preparedBy: people.purchasing_staff.userId,
      deliveryTerms: null,
    });
    await insertPurchaseOrderLines(db, purchaseOrderId, [
      {
        purchaseRequisitionLineId: source.purchaseRequisitionLineId,
        orderedQty: quantity,
        unitPrice: "1400",
      },
    ]);

    return purchaseOrderId;
  }

  function revisionInput(
    source: Awaited<ReturnType<typeof setupPendingPo>>,
    orderedQty: string,
  ) {
    return {
      purchaseOrderId: source.purchaseOrderId,
      supplierId: source.supplierId,
      deliveryTerms: "Deliver to Bay 2",
      lines: [
        {
          purchaseRequisitionLineId: source.purchaseRequisitionLineId,
          orderedQty,
          unitPrice: "1600",
        },
      ],
    };
  }

  it("revises a returned PO into a new pending version", async () => {
    const source = await setupPendingPo();
    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Price is too high.",
    });

    const result = await updatePurchaseOrderService(
      people.purchasing_staff,
      revisionInput(source, "8"),
    );

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, source.purchaseOrderId));
    const revisions = await db
      .select()
      .from(purchaseOrderRevisions)
      .where(eq(purchaseOrderRevisions.purchaseOrderId, source.purchaseOrderId))
      .orderBy(asc(purchaseOrderRevisions.versionNo));
    const lines = await findPurchaseOrderLines(db, source.purchaseOrderId);

    expect(result.versionNo).toBe(2);
    expect(header).toMatchObject({
      status: "pending_approval",
      currentVersion: 2,
      supplierId: source.supplierId,
      deliveryTerms: "Deliver to Bay 2",
      approvedBy: null,
      approvedAt: null,
    });
    expect(lines[0]).toMatchObject({ orderedQty: "8.000", unitPrice: "1600.00" });
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({
      versionNo: 1,
      budgetOk: false,
      reviewReason: "Price is too high.",
    });
    expect(revisions[1]).toMatchObject({ versionNo: 2, budgetOk: null });

    const alerts = await db.select().from(notifications);
    expect(alerts).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.accounting_associate.userId,
        notificationType: "purchase_order_pending_approval",
      }),
    );

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "purchase_order.revise" }),
    );
  });

  it("voids an earlier approval when an approved PO is revised", async () => {
    const source = await setupPendingPo();
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Budget approved.",
    });

    await expect(
      isPurchaseOrderCurrentVersionApproved(db, source.purchaseOrderId),
    ).resolves.toBe(true);

    await updatePurchaseOrderService(people.purchasing_staff, revisionInput(source, "7"));

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, source.purchaseOrderId));

    expect(header).toMatchObject({
      status: "pending_approval",
      currentVersion: 2,
      approvedBy: null,
      approvedAt: null,
    });
    await expect(
      isPurchaseOrderCurrentVersionApproved(db, source.purchaseOrderId),
    ).resolves.toBe(false);

    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Budget approved.",
    });
    await expect(
      isPurchaseOrderCurrentVersionApproved(db, source.purchaseOrderId),
    ).resolves.toBe(true);
  });

  it("counts the PR's other active POs but not the PO being edited", async () => {
    const source = await setupPendingPo();
    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Please adjust the quantity.",
    });
    await createOtherActivePo(source, "3");

    await expect(
      updatePurchaseOrderService(people.purchasing_staff, revisionInput(source, "7")),
    ).resolves.toMatchObject({ purchaseOrderId: source.purchaseOrderId, versionNo: 2 });
  });

  it("refuses a revised quantity above the remaining quantity after other POs", async () => {
    const source = await setupPendingPo();
    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Please adjust the quantity.",
    });
    await createOtherActivePo(source, "3");

    await expect(
      updatePurchaseOrderService(people.purchasing_staff, revisionInput(source, "8")),
    ).rejects.toThrow("remains available");
  });

  it("refuses to edit a PO that is still pending Accounting", async () => {
    const source = await setupPendingPo();

    await expect(
      updatePurchaseOrderService(people.purchasing_staff, revisionInput(source, "7")),
    ).rejects.toThrow("returned or approved");
  });

  it("refuses to revise a PO whose purchase request was cancelled", async () => {
    const source = await setupPendingPo();
    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Please revise.",
    });
    await db
      .update(purchaseRequisitions)
      .set({ status: "cancelled" })
      .where(
        eq(purchaseRequisitions.purchaseRequisitionId, source.purchaseRequisitionId),
      );

    await expect(
      updatePurchaseOrderService(people.purchasing_staff, revisionInput(source, "7")),
    ).rejects.toThrow("cancelled");
  });

  it("blocks another role from revising", async () => {
    const source = await setupPendingPo();
    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: source.purchaseOrderId,
      reason: "Please revise.",
    });

    await expect(
      updatePurchaseOrderService(people.requester, revisionInput(source, "7")),
    ).rejects.toThrow("Only Purchasing Staff");

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({ action: "blocked:purchase_order.revise" }),
    );
  });
});
