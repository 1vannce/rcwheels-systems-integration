import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
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

import { createPurchaseOrderService } from "./purchase-order.create.service";
import { discardPurchaseOrderDraftService } from "./purchase-order.discard.service";
import { approvePurchaseOrderService } from "./purchase-order.review.service";
import { updatePurchaseOrderService } from "./purchase-order.update.service";
import { listOpenPurchaseRequisitionsService } from "./purchase-requisition.lists.service";

describeWithDatabase("purchase request coverage from purchase orders", () => {
  let people: Record<AppRole, AppUser>;
  let sequence = 0;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    sequence = 0;
  });

  afterAll(closeDatabase);

  async function setupOpenPr(requestedQuantities: readonly string[] = ["10"]) {
    sequence += 1;
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: `Coverage Supplier ${sequence}` })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "open",
      })
      .returning();

    const lines: {
      purchaseRequisitionLineId: number;
      itemCode: string;
      requestedQty: string;
    }[] = [];

    for (const [index, requestedQty] of requestedQuantities.entries()) {
      const itemCode = `PR-COV-${sequence}-${index + 1}`;
      const itemId = await createItem(itemCode, "0");
      const request = await createRequisitionLine(
        people.requester.userId,
        itemId,
        requestedQty,
      );
      const [line] = await db
        .insert(purchaseRequisitionLines)
        .values({
          purchaseRequisitionId: pr.purchaseRequisitionId,
          requisitionLineId: request.requisitionLineId,
          itemId,
          requestedQty,
        })
        .returning();

      lines.push({
        purchaseRequisitionLineId: line.purchaseRequisitionLineId,
        itemCode,
        requestedQty,
      });
    }

    return {
      purchaseRequisitionId: pr.purchaseRequisitionId,
      supplierId: supplier.supplierId,
      lines,
    };
  }

  async function createDraft(
    source: Awaited<ReturnType<typeof setupOpenPr>>,
    quantities: readonly string[],
  ): Promise<number> {
    const { purchaseOrderId } = await createPurchaseOrderService(
      people.purchasing_staff,
      {
        purchaseRequisitionId: source.purchaseRequisitionId,
        supplierId: source.supplierId,
        deliveryTerms: null,
        lines: source.lines
          .map((line, index) => ({
            purchaseRequisitionLineId: line.purchaseRequisitionLineId,
            orderedQty: quantities[index] ?? "0",
            unitPrice: "1500",
          }))
          .filter((line) => Number(line.orderedQty) > 0),
      },
    );

    return purchaseOrderId;
  }

  async function prStatus(purchaseRequisitionId: number) {
    const [row] = await db
      .select({ status: purchaseRequisitions.status })
      .from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.purchaseRequisitionId, purchaseRequisitionId));

    return row.status;
  }

  it("marks the PR covered only after every line has committed PO quantity", async () => {
    const source = await setupOpenPr(["4", "6"]);

    const firstPo = await createDraft(source, ["4", "0"]);
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: firstPo,
      reason: "Budget approved.",
    });

    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");

    const secondPo = await createDraft(source, ["0", "6"]);
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: secondPo,
      reason: "Budget approved.",
    });

    expect(await prStatus(source.purchaseRequisitionId)).toBe("covered");

    const open = await listOpenPurchaseRequisitionsService();
    expect(open.map((pr) => pr.purchaseRequisitionId)).not.toContain(
      source.purchaseRequisitionId,
    );

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_requisition.cover",
        entityId: source.purchaseRequisitionId,
      }),
    );
  });

  it("keeps the PR open while only a draft covers it and blocks a duplicate draft", async () => {
    const source = await setupOpenPr(["10"]);

    const draft = await createDraft(source, ["10"]);
    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");

    await expect(createDraft(source, ["1"])).rejects.toThrow(
      "already fully covered by purchase orders",
    );

    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: draft,
      reason: "Budget approved.",
    });
    expect(await prStatus(source.purchaseRequisitionId)).toBe("covered");
  });

  it("discards an unapproved draft and releases its quantity", async () => {
    const source = await setupOpenPr(["10"]);
    const draft = await createDraft(source, ["10"]);

    await discardPurchaseOrderDraftService(people.purchasing_staff, {
      purchaseOrderId: draft,
    });

    const [header] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, draft));
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, draft));

    expect(header.status).toBe("cancelled");
    expect(lines).toHaveLength(1);
    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");

    const replacement = await createDraft(source, ["10"]);
    expect(replacement).not.toBe(draft);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "purchase_order.discard")));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(draft);
  });

  it("refuses to discard a PO that Accounting already approved", async () => {
    const source = await setupOpenPr(["10"]);
    const draft = await createDraft(source, ["10"]);
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: draft,
      reason: "Budget approved.",
    });

    await expect(
      discardPurchaseOrderDraftService(people.purchasing_staff, {
        purchaseOrderId: draft,
      }),
    ).rejects.toThrow("has not approved");

    expect(await prStatus(source.purchaseRequisitionId)).toBe("covered");
  });

  it("blocks another role from discarding a draft", async () => {
    const source = await setupOpenPr(["10"]);
    const draft = await createDraft(source, ["10"]);

    await expect(
      discardPurchaseOrderDraftService(people.accounting_associate, {
        purchaseOrderId: draft,
      }),
    ).rejects.toThrow("Only Purchasing Staff");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "blocked:purchase_order.discard")));
    expect(audits).toHaveLength(1);
  });

  it("reopens a covered PR when an approved PO is revised below its requested quantity", async () => {
    const source = await setupOpenPr(["10"]);
    const draft = await createDraft(source, ["10"]);
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: draft,
      reason: "Budget approved.",
    });
    expect(await prStatus(source.purchaseRequisitionId)).toBe("covered");

    await updatePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId: draft,
      supplierId: source.supplierId,
      deliveryTerms: null,
      lines: [
        {
          purchaseRequisitionLineId: source.lines[0].purchaseRequisitionLineId,
          orderedQty: "6",
          unitPrice: "1500",
        },
      ],
    });

    expect(await prStatus(source.purchaseRequisitionId)).toBe("open");

    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "purchase_requisition.reopen",
        entityId: source.purchaseRequisitionId,
      }),
    );
  });
});
