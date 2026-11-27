import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  stockMovements,
  supplierReceiptLines,
  supplierReceipts,
  suppliers,
  users,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import { BlockedActionError } from "@/modules/core";
import {
  lockPurchaseOrderForReceivingService,
  type PurchaseOrderStatus,
} from "@/modules/purchasing";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { averageCost, createItem, movements, onHand } from "@/test/stock-fixtures";

import { receiveSupplierDeliveryAction } from "../actions/supplier-receiving.actions";
import type { ReceiveSupplierDeliveryInput } from "../schemas/delivery.schema";
import { receiveSupplierDelivery } from "./supplier-receiving.service";

// Supplier receiving (Phase 6, BR-SR-01 to BR-SR-05, BR-SR-09). Only the
// Next.js request APIs are faked for the action tests: revalidatePath,
// connection(), and the cookie-backed Supabase client that yields the
// signed-in auth ID. requireRole and the services run against the test DB.

const session = vi.hoisted(() => ({ authUserId: null as string | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("@/lib/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: session.authUserId ? { claims: { sub: session.authUserId } } : null,
      }),
    },
  }),
}));

describeWithDatabase("supplier receiving", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    session.authUserId = null;
  });

  afterAll(closeDatabase);

  /** A PO in the given status with one line per item, as Purchasing leaves it. */
  async function createPurchaseOrder(
    lines: readonly { itemCode: string; orderedQty: string; unitPrice: string }[],
    status: PurchaseOrderStatus = "placed",
  ) {
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
      .returning();
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "covered",
      })
      .returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        supplierId: supplier.supplierId,
        preparedBy: people.purchasing_staff.userId,
        approvedBy: people.accounting_associate.userId,
        approvedAt: new Date(),
        orderedAt: status === "placed" ? new Date() : null,
        status,
      })
      .returning();
    const created: { itemId: number; purchaseOrderLineId: number }[] = [];

    for (const line of lines) {
      const itemId = await createItem(line.itemCode, "0");
      const [prLine] = await db
        .insert(purchaseRequisitionLines)
        .values({
          purchaseRequisitionId: pr.purchaseRequisitionId,
          itemId,
          requestedQty: line.orderedQty,
        })
        .returning();
      const [poLine] = await db
        .insert(purchaseOrderLines)
        .values({
          purchaseOrderId: po.purchaseOrderId,
          purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
          orderedQty: line.orderedQty,
          unitPrice: line.unitPrice,
        })
        .returning();

      created.push({ itemId, purchaseOrderLineId: poLine.purchaseOrderLineId });
    }

    return { purchaseOrderId: po.purchaseOrderId, lines: created };
  }

  function delivery(
    purchaseOrderId: number,
    lines: ReceiveSupplierDeliveryInput["lines"],
    deliveryReceiptNo = "DR-1001",
  ): ReceiveSupplierDeliveryInput {
    return { purchaseOrderId, deliveryReceiptNo, invoiceNo: "INV-2001", lines };
  }

  function line(
    purchaseOrderLineId: number,
    deliveredQty: string,
    acceptedQty = deliveredQty,
    rejectedQty = "0",
  ) {
    return {
      purchaseOrderLineId,
      deliveredQty,
      acceptedQty,
      rejectedQty,
      inspectionNotes: rejectedQty === "0" ? "" : "Damaged sidewall",
    };
  }

  async function poStatus(purchaseOrderId: number) {
    const [row] = await db
      .select({ status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));

    return row.status;
  }

  async function outstanding(purchaseOrderId: number) {
    const po = await db.transaction((tx) => lockPurchaseOrderForReceivingService(tx, purchaseOrderId));

    return po?.lines.map((poLine) => poLine.outstandingQty);
  }

  async function auditActions() {
    return (await db.select().from(auditLog)).map((row) => row.action);
  }

  it("closes the PO when the full order is accepted and posts stock once at the PO price", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-FULL", orderedQty: "10", unitPrice: "1500" }]);
    const [poLine] = po.lines;

    const result = await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "10")]),
    );

    expect(result.purchaseOrderStatus).toBe("closed");
    expect(await poStatus(po.purchaseOrderId)).toBe("closed");
    expect(await outstanding(po.purchaseOrderId)).toEqual(["0.000"]);
    expect(await onHand(poLine.itemId)).toBe("10.000");
    expect(await averageCost(poLine.itemId)).toBe("1500.0000");

    const posted = await movements();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      movementType: "supplier_receipt",
      quantityDelta: "10.000",
      supplierReceiptLineId: result.supplierReceiptLineIds[0],
    });

    const [receipt] = await db.select().from(supplierReceipts);
    expect(receipt).toMatchObject({
      purchaseOrderId: po.purchaseOrderId,
      receivedBy: people.inventory_custodian.userId,
      deliveryReceiptNo: "DR-1001",
      invoiceNo: "INV-2001",
    });
    expect(await auditActions()).toEqual(
      expect.arrayContaining(["supplier_receipt.receive", "purchase_order.close"]),
    );
    expect(await db.select().from(notifications)).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "purchase_order_closed",
      }),
    );
  });

  it("posts the lines in item ID order whatever order the form sends them", async () => {
    const po = await createPurchaseOrder([
      { itemCode: "SR-ORDER-A", orderedQty: "2", unitPrice: "100" },
      { itemCode: "SR-ORDER-B", orderedQty: "3", unitPrice: "100" },
    ]);
    const [first, second] = po.lines;

    await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [
        line(second.purchaseOrderLineId, "3"),
        line(first.purchaseOrderLineId, "2"),
      ]),
    );

    expect((await movements()).map((row) => row.quantityDelta)).toEqual(["2.000", "3.000"]);
  });

  it("leaves 4 outstanding on a PO of 10 with 6 accepted and checks the next delivery against it (scenario 5)", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-PART", orderedQty: "10", unitPrice: "800" }]);
    const [poLine] = po.lines;

    const first = await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "6")]),
    );

    expect(first.purchaseOrderStatus).toBe("partially_received");
    expect(await poStatus(po.purchaseOrderId)).toBe("partially_received");
    expect(await outstanding(po.purchaseOrderId)).toEqual(["4.000"]);
    expect(await onHand(poLine.itemId)).toBe("6.000");
    expect(await auditActions()).toContain("purchase_order.partially_receive");

    // The follow-up delivery is checked against the 4 left, not the 10 ordered.
    await expect(
      receiveSupplierDelivery(
        people.inventory_custodian,
        delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "5")], "DR-1002"),
      ),
    ).rejects.toThrow("Only 4");

    const second = await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "4")], "DR-1003"),
    );

    expect(second.purchaseOrderStatus).toBe("closed");
    expect(await onHand(poLine.itemId)).toBe("10.000");
    expect(await movements()).toHaveLength(2);
    expect(await db.select().from(supplierReceipts)).toHaveLength(2);
  });

  it("blocks a delivery above the outstanding balance and records nothing but the refusal", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-OVER", orderedQty: "10", unitPrice: "500" }]);
    const [poLine] = po.lines;

    const attempt = receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "11")]),
    );

    await expect(attempt).rejects.toBeInstanceOf(BlockedActionError);
    await expect(attempt).rejects.toThrow("Only 10");
    expect(await db.select().from(supplierReceipts)).toHaveLength(0);
    expect(await db.select().from(supplierReceiptLines)).toHaveLength(0);
    expect(await movements()).toHaveLength(0);
    expect(await onHand(poLine.itemId)).toBe("0.000");
    expect(await poStatus(po.purchaseOrderId)).toBe("placed");
    expect(await auditActions()).toEqual(["blocked:supplier_receipt.receive"]);
  });

  it("posts accepted quantity once per line and never posts rejected quantity", async () => {
    const po = await createPurchaseOrder([
      { itemCode: "SR-SPLIT", orderedQty: "10", unitPrice: "1200" },
      { itemCode: "SR-REJECT", orderedQty: "5", unitPrice: "300" },
    ]);
    const [split, rejected] = po.lines;

    const result = await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [
        line(split.purchaseOrderLineId, "10", "7", "3"),
        line(rejected.purchaseOrderLineId, "5", "0", "5"),
      ]),
    );

    const posted = await movements();
    expect(posted).toHaveLength(1);
    expect(result.movementIds).toEqual([posted[0].movementId]);
    expect(posted[0]).toMatchObject({
      quantityDelta: "7.000",
      supplierReceiptLineId: result.supplierReceiptLineIds[0],
    });
    expect(await onHand(split.itemId)).toBe("7.000");
    expect(await onHand(rejected.itemId)).toBe("0.000");

    // Rejected quantity stays outstanding on the PO for the follow-up delivery.
    expect(result.purchaseOrderStatus).toBe("partially_received");
    expect(await outstanding(po.purchaseOrderId)).toEqual(["3.000", "5.000"]);

    const receiptLines = await db.select().from(supplierReceiptLines);
    expect(receiptLines.map((row) => [row.acceptedQty, row.rejectedQty])).toEqual([
      ["7.000", "3.000"],
      ["0.000", "5.000"],
    ]);
  });

  it("leaves the PO status alone when every delivered item is rejected", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-ALLREJ", orderedQty: "4", unitPrice: "100" }]);
    const [poLine] = po.lines;

    const result = await receiveSupplierDelivery(
      people.inventory_custodian,
      delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "4", "0", "4")]),
    );

    expect(result.purchaseOrderStatus).toBe("placed");
    expect(result.movementIds).toEqual([]);
    expect(await poStatus(po.purchaseOrderId)).toBe("placed");
    expect(await movements()).toHaveLength(0);
  });

  it("blocks accepted and rejected quantities that do not add up to the delivered quantity", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-SUM", orderedQty: "10", unitPrice: "100" }]);
    const [poLine] = po.lines;

    await expect(
      receiveSupplierDelivery(
        people.inventory_custodian,
        delivery(po.purchaseOrderId, [line(poLine.purchaseOrderLineId, "5", "3", "1")]),
      ),
    ).rejects.toThrow("must add up to the delivered quantity");
    expect(await movements()).toHaveLength(0);
  });

  it("blocks a line from another PO and a line recorded twice", async () => {
    const po = await createPurchaseOrder([{ itemCode: "SR-OWN", orderedQty: "10", unitPrice: "100" }]);
    const other = await createPurchaseOrder([{ itemCode: "SR-OTHER", orderedQty: "10", unitPrice: "100" }]);

    await expect(
      receiveSupplierDelivery(
        people.inventory_custodian,
        delivery(po.purchaseOrderId, [line(other.lines[0].purchaseOrderLineId, "1")]),
      ),
    ).rejects.toThrow("not on this purchase order");
    await expect(
      receiveSupplierDelivery(
        people.inventory_custodian,
        delivery(po.purchaseOrderId, [
          line(po.lines[0].purchaseOrderLineId, "2"),
          line(po.lines[0].purchaseOrderLineId, "2"),
        ]),
      ),
    ).rejects.toThrow("once");
    expect(await movements()).toHaveLength(0);
  });

  it.each(["approved", "closed", "cancelled"] as const)(
    "blocks receiving against a %s PO",
    async (status) => {
      const po = await createPurchaseOrder(
        [{ itemCode: `SR-${status}`, orderedQty: "10", unitPrice: "100" }],
        status,
      );

      await expect(
        receiveSupplierDelivery(
          people.inventory_custodian,
          delivery(po.purchaseOrderId, [line(po.lines[0].purchaseOrderLineId, "1")]),
        ),
      ).rejects.toThrow("placed or partially received");
      expect(await movements()).toHaveLength(0);
    },
  );

  it.each(["delivery_operations", "purchasing_staff"] as const)("blocks the %s role in the service", async (role) => {
    const po = await createPurchaseOrder([{ itemCode: "SR-ROLE", orderedQty: "10", unitPrice: "100" }]);

    await expect(
      receiveSupplierDelivery(
        people[role],
        delivery(po.purchaseOrderId, [line(po.lines[0].purchaseOrderLineId, "10")]),
      ),
    ).rejects.toBeInstanceOf(BlockedActionError);
    expect(await movements()).toHaveLength(0);
    expect(await auditActions()).toEqual(["blocked:supplier_receipt.receive"]);
  });

  describe("receive action", () => {
    async function signInAs(user: AppUser) {
      const [row] = await db
        .select({ authUserId: users.authUserId })
        .from(users)
        .where(eq(users.userId, user.userId));

      session.authUserId = row.authUserId;
    }

    function form(purchaseOrderId: number, purchaseOrderLineId: number): FormData {
      const data = new FormData();

      data.set("purchaseOrderId", String(purchaseOrderId));
      data.set("deliveryReceiptNo", "DR-3001");
      data.set("invoiceNo", "");
      data.set(
        "lines",
        JSON.stringify([
          { purchaseOrderLineId, deliveredQty: "10", acceptedQty: "10", rejectedQty: "0" },
        ]),
      );

      return data;
    }

    it.each(["delivery_operations", "requester", "requisition_approver", "purchasing_staff", "accounting_associate"] as const)(
      "blocks and audits the %s role (scenario 12)",
      async (role) => {
        const po = await createPurchaseOrder([{ itemCode: `SR-A-${role}`, orderedQty: "10", unitPrice: "100" }]);
        await signInAs(people[role]);

        const result = await receiveSupplierDeliveryAction(
          null,
          form(po.purchaseOrderId, po.lines[0].purchaseOrderLineId),
        );

        expect(result.ok).toBe(false);
        expect(await db.select().from(supplierReceipts)).toHaveLength(0);
        expect(await db.select().from(stockMovements)).toHaveLength(0);
        expect(await poStatus(po.purchaseOrderId)).toBe("placed");
        expect(
          await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.action, "blocked:supplier_receipt.receive")),
        ).toHaveLength(1);
      },
    );

    it("says nothing was added to stock when every item is rejected", async () => {
      const po = await createPurchaseOrder([{ itemCode: "SR-A-REJ", orderedQty: "10", unitPrice: "100" }]);
      await signInAs(people.inventory_custodian);
      const data = form(po.purchaseOrderId, po.lines[0].purchaseOrderLineId);
      data.set(
        "lines",
        JSON.stringify([
          {
            purchaseOrderLineId: po.lines[0].purchaseOrderLineId,
            deliveredQty: "10",
            acceptedQty: "0",
            rejectedQty: "10",
            inspectionNotes: "Wrong size",
          },
        ]),
      );

      const result = await receiveSupplierDeliveryAction(null, data);

      expect(result).toMatchObject({ ok: true, message: expect.stringContaining("no stock") });
      expect(await db.select().from(stockMovements)).toHaveLength(0);
    });

    it("lets the inventory_custodian receive a delivery", async () => {
        const po = await createPurchaseOrder([{ itemCode: "SR-OK", orderedQty: "10", unitPrice: "100" }]);
        await signInAs(people.inventory_custodian);

        const result = await receiveSupplierDeliveryAction(
          null,
          form(po.purchaseOrderId, po.lines[0].purchaseOrderLineId),
        );

        expect(result).toMatchObject({ ok: true });
        expect(await poStatus(po.purchaseOrderId)).toBe("closed");
        expect(await onHand(po.lines[0].itemId)).toBe("10.000");

        const [receipt] = await db.select().from(supplierReceipts);
        expect(receipt.receivedBy).toBe(people.inventory_custodian.userId);
        expect(receipt.invoiceNo).toBeNull();
    });
  });
});
