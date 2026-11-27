import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  purchaseOrderLines,
  purchaseOrders,
  purchaseRequisitionLines,
  purchaseRequisitions,
  requisitionLines,
  requisitions,
  supplierCommitments,
  supplierDiscrepancies,
  suppliers,
  users,
} from "@/db/schema";
import type { AppRole, AppUser } from "@/modules/core";
import {
  approvePurchaseOrderService,
  cancelPurchaseOrderBalanceService,
  createPurchaseOrderService,
  createShortagePurchaseRequisitionService,
  lockPurchaseOrderForReceivingService,
  placePurchaseOrderService,
  returnPurchaseOrderService,
} from "@/modules/purchasing";
import { markAwaitingStockService, reserveRequisitionService } from "@/modules/requisition";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, createRequisitionLine, movements, onHand } from "@/test/stock-fixtures";

import {
  agreeSupplierDiscrepancyAction,
  createSupplierDiscrepancyAction,
} from "../actions/supplier-discrepancy.actions";
import type { SupplierCommitmentAction } from "../types/supplier-discrepancy.type";
import {
  agreeSupplierDiscrepancy,
  createSupplierDiscrepancy,
  getSupplierDiscrepancy,
  listSupplierDiscrepancies,
  resolveSupplierDiscrepancy,
  updateSupplierDiscrepancy,
} from "./supplier-discrepancy.service";
import { receiveSupplierDelivery } from "./supplier-receiving.service";

// Supplier Discrepancy Reports and connector D (Phase 6, BR-SR-07, BR-SR-08,
// BR-SR-10; PLAN scenarios 4 to 7). Only the Next.js request APIs are faked for
// the action tests.

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

describeWithDatabase("supplier discrepancy reports and connector D", () => {
  let people: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    session.authUserId = null;
  });

  afterAll(closeDatabase);

  async function createSupplier() {
    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
      .returning();

    return supplier.supplierId;
  }

  /** A placed PO for 10 of one item, with its covered purchase request. */
  async function createPlacedOrder(itemCode: string) {
    const supplierId = await createSupplier();
    const itemId = await createItem(itemCode, "0");
    const [pr] = await db
      .insert(purchaseRequisitions)
      .values({
        requestedBy: people.inventory_custodian.userId,
        requestReason: "shortage",
        status: "covered",
      })
      .returning();
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({ purchaseRequisitionId: pr.purchaseRequisitionId, itemId, requestedQty: "10" })
      .returning();
    const [po] = await db
      .insert(purchaseOrders)
      .values({
        supplierId,
        preparedBy: people.purchasing_staff.userId,
        approvedBy: people.accounting_associate.userId,
        approvedAt: new Date(),
        orderedAt: new Date(),
        status: "placed",
      })
      .returning();
    const [poLine] = await db
      .insert(purchaseOrderLines)
      .values({
        purchaseOrderId: po.purchaseOrderId,
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: "10",
        unitPrice: "800",
      })
      .returning();

    return {
      purchaseOrderId: po.purchaseOrderId,
      purchaseOrderLineId: poLine.purchaseOrderLineId,
      purchaseRequisitionId: pr.purchaseRequisitionId,
      itemId,
    };
  }

  /**
   * An approved request for 10 that has no stock, taken through the Custodian's
   * shortage purchase request and a PO draft waiting for Accounting.
   */
  async function createShortageDraftOrder(itemCode: string) {
    const supplierId = await createSupplier();
    const itemId = await createItem(itemCode, "0");
    const request = await createRequisitionLine(people.requester.userId, itemId, "10");

    await db
      .update(requisitionLines)
      .set({ approvedQty: "10" })
      .where(eq(requisitionLines.requisitionLineId, request.requisitionLineId));
    await db
      .update(requisitions)
      .set({ status: "approved" })
      .where(eq(requisitions.requisitionId, request.requisitionId));
    await markAwaitingStockService(people.inventory_custodian, request.requisitionId);

    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      {
        requisitionId: request.requisitionId,
        lines: [{ requisitionLineId: request.requisitionLineId, requestedQty: "10" }],
      },
    );
    const [prLine] = await db
      .select()
      .from(purchaseRequisitionLines)
      .where(eq(purchaseRequisitionLines.purchaseRequisitionId, purchaseRequisitionId));
    const { purchaseOrderId } = await createPurchaseOrderService(people.purchasing_staff, {
      purchaseRequisitionId,
      supplierId,
      deliveryTerms: null,
      lines: [
        {
          purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
          orderedQty: "10",
          unitPrice: "800",
        },
      ],
    });
    const [poLine] = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId));

    return {
      ...request,
      itemId,
      purchaseOrderId,
      purchaseOrderLineId: poLine.purchaseOrderLineId,
    };
  }

  let receiptNo = 0;

  function receive(
    order: { purchaseOrderId: number; purchaseOrderLineId: number },
    acceptedQty: string,
    rejected: { qty: string; deliveredQty: string } = { qty: "0", deliveredQty: acceptedQty },
  ) {
    receiptNo += 1;

    return receiveSupplierDelivery(people.inventory_custodian, {
      purchaseOrderId: order.purchaseOrderId,
      deliveryReceiptNo: `DR-${receiptNo}`,
      invoiceNo: "",
      lines: [
        {
          purchaseOrderLineId: order.purchaseOrderLineId,
          deliveredQty: rejected.deliveredQty,
          acceptedQty,
          rejectedQty: rejected.qty,
          inspectionNotes: rejected.qty === "0" ? "" : "Damaged sidewall",
        },
      ],
    });
  }

  function agree(
    supplierDiscrepancyId: number,
    agreedAction: SupplierCommitmentAction,
    committedQty: string,
    actor = people.purchasing_staff,
  ) {
    return agreeSupplierDiscrepancy(actor, {
      supplierDiscrepancyId,
      agreedAction,
      committedQty,
      expectedDeliveryDate: new Date("2026-12-04"),
    });
  }

  function resolve(supplierDiscrepancyId: number, actor = people.purchasing_staff) {
    return resolveSupplierDiscrepancy(actor, { supplierDiscrepancyId, note: "Confirmed" });
  }

  async function reports() {
    return db
      .select()
      .from(supplierDiscrepancies)
      .orderBy(asc(supplierDiscrepancies.supplierDiscrepancyId));
  }

  async function outstanding(purchaseOrderId: number) {
    const po = await db.transaction((tx) =>
      lockPurchaseOrderForReceivingService(tx, purchaseOrderId),
    );

    return po?.lines.map((line) => line.outstandingQty);
  }

  async function requestStatus(requisitionId: number) {
    const [row] = await db
      .select({ status: requisitions.status })
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));

    return row.status;
  }

  async function arrivalFlags() {
    return (await db.select().from(notifications)).filter(
      (row) => row.notificationType === "requisition_stock_arrived",
    );
  }

  it("takes a shortage through PR, PO, and receipt, then resumes the request (scenario 4)", async () => {
    const order = await createShortageDraftOrder("SDR-SHORTAGE");

    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: order.purchaseOrderId,
      reason: "Budget approved.",
    });
    await placePurchaseOrderService(people.purchasing_staff, {
      purchaseOrderId: order.purchaseOrderId,
    });

    const result = await receive(order, "10");

    // Connector D flags the waiting request and changes nothing about it.
    expect(result.flaggedRequisitionIds).toEqual([order.requisitionId]);
    expect(await arrivalFlags()).toEqual([
      expect.objectContaining({
        recipientUserId: people.inventory_custodian.userId,
        requisitionId: order.requisitionId,
      }),
    ]);
    expect(await requestStatus(order.requisitionId)).toBe("awaiting_stock");
    expect(result.supplierDiscrepancyIds).toEqual([]);

    // No second posting: one movement, for the receipt line.
    expect(await movements()).toHaveLength(1);
    expect(await onHand(order.itemId)).toBe("10.000");

    const reserved = await reserveRequisitionService(people.inventory_custodian, {
      requisitionId: order.requisitionId,
      lines: [{ requisitionLineId: order.requisitionLineId, quantity: "10" }],
    });

    expect(reserved.status).toBe("approved");
    expect(await onHand(order.itemId)).toBe("10.000");
  });

  it("flags nothing when the delivery is fully rejected or no request waits for the item", async () => {
    const order = await createShortageDraftOrder("SDR-NOFLAG");

    await db
      .update(purchaseOrders)
      .set({ status: "placed", orderedAt: new Date() })
      .where(eq(purchaseOrders.purchaseOrderId, order.purchaseOrderId));

    const rejected = await receive(order, "0", { qty: "10", deliveredQty: "10" });
    const other = await receive(await createPlacedOrder("SDR-UNWANTED"), "10");

    expect(rejected.flaggedRequisitionIds).toEqual([]);
    expect(other.flaggedRequisitionIds).toEqual([]);
    expect(await arrivalFlags()).toEqual([]);
  });

  it("keeps 4 outstanding on a PO of 10 with 6 accepted and closes the SDR on the follow-up (scenario 5)", async () => {
    const order = await createPlacedOrder("SDR-FIVE");

    const first = await receive(order, "6");

    expect(first.supplierDiscrepancyIds).toHaveLength(1);
    expect(await reports()).toEqual([
      expect.objectContaining({
        supplierReceiptLineId: null,
        affectedQty: "4.000",
        status: "open",
      }),
    ]);
    expect(await outstanding(order.purchaseOrderId)).toEqual(["4.000"]);
    expect(await db.select().from(notifications)).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.purchasing_staff.userId,
        notificationType: "supplier_discrepancy_opened",
      }),
    );

    const [supplierDiscrepancyId] = first.supplierDiscrepancyIds;

    await agree(supplierDiscrepancyId, "replace", "4");
    await expect(receive(order, "5")).rejects.toThrow("Only 4");

    // A partial follow-up leaves the commitment open and repeats no report.
    const partial = await receive(order, "1");

    expect(partial.supplierDiscrepancyIds).toEqual([]);
    expect((await reports())[0].status).toBe("agreed");

    const last = await receive(order, "3");

    expect(last.purchaseOrderStatus).toBe("closed");
    expect(await reports()).toEqual([
      expect.objectContaining({
        status: "resolved",
        resolutionAction: expect.stringContaining("Replacement received"),
      }),
    ]);
    const [commitment] = await db.select().from(supplierCommitments);
    expect(commitment.status).toBe("fulfilled");

    // One movement per accepted receipt line: 6, 1, and 3.
    expect((await movements()).map((row) => row.quantityDelta)).toEqual([
      "6.000",
      "1.000",
      "3.000",
    ]);
    expect(await onHand(order.itemId)).toBe("10.000");
  });

  it("opens one SDR for rejected quantity and one for the shortage", async () => {
    const order = await createPlacedOrder("SDR-BOTH");

    const result = await receive(order, "7", { qty: "1", deliveredQty: "8" });
    const [rejected, short] = await reports();

    expect(result.supplierDiscrepancyIds).toHaveLength(2);
    expect(rejected).toMatchObject({
      supplierReceiptLineId: result.supplierReceiptLineIds[0],
      affectedQty: "1.000",
      problem: "Damaged sidewall",
    });
    expect(short).toMatchObject({ supplierReceiptLineId: null, affectedQty: "2.000" });
    expect(await onHand(order.itemId)).toBe("7.000");
  });

  it("counts each accepted unit toward only one replacement, oldest first", async () => {
    const order = await createPlacedOrder("SDR-FIFO");
    const { supplierDiscrepancyIds } = await receive(order, "4", { qty: "2", deliveredQty: "6" });
    const [rejectedId, shortId] = supplierDiscrepancyIds;

    await agree(rejectedId, "replace", "2");
    await agree(shortId, "replace", "4");

    await receive(order, "3");

    expect((await reports()).map((row) => row.status)).toEqual(["resolved", "agreed"]);

    await receive(order, "3");

    expect((await reports()).map((row) => row.status)).toEqual(["resolved", "resolved"]);
  });

  it("lists a line that did not arrive at all as short", async () => {
    const order = await createPlacedOrder("SDR-LINE-A");
    const itemId = await createItem("SDR-LINE-B", "0");
    const [prLine] = await db
      .insert(purchaseRequisitionLines)
      .values({
        purchaseRequisitionId: order.purchaseRequisitionId,
        itemId,
        requestedQty: "5",
      })
      .returning();
    const [secondLine] = await db
      .insert(purchaseOrderLines)
      .values({
        purchaseOrderId: order.purchaseOrderId,
        purchaseRequisitionLineId: prLine.purchaseRequisitionLineId,
        orderedQty: "5",
        unitPrice: "100",
      })
      .returning();

    await receive(order, "10");

    expect(await reports()).toEqual([
      expect.objectContaining({
        purchaseOrderLineId: secondLine.purchaseOrderLineId,
        affectedQty: "5.000",
      }),
    ]);
  });

  it("leaves a PO that Accounting returned unaffected by receiving and SDRs (scenario 6)", async () => {
    const returned = await createShortageDraftOrder("SDR-RETURNED");

    await returnPurchaseOrderService(people.accounting_associate, {
      purchaseOrderId: returned.purchaseOrderId,
      reason: "Confirm the quantity.",
    });

    const other = await createPlacedOrder("SDR-NEIGHBOUR");

    await receive(other, "6");
    await expect(receive(returned, "10")).rejects.toThrow("placed or partially received");
    await expect(
      createSupplierDiscrepancy(people.inventory_custodian, {
        purchaseOrderId: returned.purchaseOrderId,
        purchaseOrderLineId: returned.purchaseOrderLineId,
        affectedQty: "1",
        problem: "Wrong size",
      }),
    ).rejects.toThrow("placed with the supplier");

    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, returned.purchaseOrderId));

    expect(po.status).toBe("for_revision");
    expect(await outstanding(returned.purchaseOrderId)).toEqual(["10.000"]);
    expect((await reports()).map((row) => row.purchaseOrderLineId)).toEqual([
      other.purchaseOrderLineId,
    ]);
    expect(await onHand(returned.itemId)).toBe("0.000");
    expect(await requestStatus(returned.requisitionId)).toBe("awaiting_stock");
    expect(await arrivalFlags()).toEqual([]);
  });

  it("cancels the balance after a partial receipt through connector G (scenario 7)", async () => {
    const order = await createPlacedOrder("SDR-CANCEL");
    const [supplierDiscrepancyId] = (await receive(order, "6")).supplierDiscrepancyIds;

    await agree(supplierDiscrepancyId, "cancel", "4");

    expect(await db.select().from(notifications)).toContainEqual(
      expect.objectContaining({
        recipientUserId: people.accounting_associate.userId,
        notificationType: "supplier_discrepancy_cancel_requested",
      }),
    );
    // Agreeing changes no PO quantity; only Accounting's cancel does.
    expect(await outstanding(order.purchaseOrderId)).toEqual(["4.000"]);
    await expect(resolve(supplierDiscrepancyId)).rejects.toThrow("has not cancelled");

    await cancelPurchaseOrderBalanceService(people.accounting_associate, {
      purchaseOrderId: order.purchaseOrderId,
      reason: "Supplier cannot deliver the rest.",
    });
    await resolve(supplierDiscrepancyId);

    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, order.purchaseOrderId));
    const [pr] = await db
      .select()
      .from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.purchaseRequisitionId, order.purchaseRequisitionId));

    expect(po.status).toBe("closed");
    expect(pr.status).toBe("open");
    expect(await outstanding(order.purchaseOrderId)).toEqual(["0.000"]);
    expect((await reports())[0].status).toBe("resolved");
    await expect(receive(order, "4")).rejects.toThrow("placed or partially received");
    expect(await movements()).toHaveLength(1);
    expect(await onHand(order.itemId)).toBe("6.000");
  });

  it("moves a report from Open to Agreed to Resolved and refuses every other step", async () => {
    const order = await createPlacedOrder("SDR-STATUS");
    const [supplierDiscrepancyId] = (await receive(order, "6")).supplierDiscrepancyIds;
    const change = { supplierDiscrepancyId, affectedQty: "3", problem: "Three short" };

    await expect(resolve(supplierDiscrepancyId)).rejects.toThrow("agreed action");
    await updateSupplierDiscrepancy(people.inventory_custodian, change);
    await expect(agree(supplierDiscrepancyId, "credit", "4")).rejects.toThrow("cannot exceed");

    await agree(supplierDiscrepancyId, "credit", "3");

    await expect(agree(supplierDiscrepancyId, "credit", "3")).rejects.toThrow("Only an open");
    await expect(updateSupplierDiscrepancy(people.inventory_custodian, change)).rejects.toThrow(
      "Only an open",
    );
    expect(await getSupplierDiscrepancy(people.purchasing_staff, supplierDiscrepancyId)).toEqual(
      expect.objectContaining({
        status: "agreed",
        affectedQty: "3.000",
        commitment: expect.objectContaining({
          agreedAction: "credit",
          committedQty: "3.000",
          expectedDeliveryDate: new Date("2026-12-04"),
          status: "open",
        }),
      }),
    );

    await resolve(supplierDiscrepancyId, people.inventory_custodian);

    await expect(resolve(supplierDiscrepancyId)).rejects.toThrow("agreed action");
    expect((await reports())[0]).toMatchObject({
      status: "resolved",
      resolutionAction: "Confirmed",
    });
    expect((await db.select().from(auditLog)).map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "supplier_discrepancy.create",
        "supplier_discrepancy.update",
        "supplier_discrepancy.agree",
        "supplier_discrepancy.resolve",
        "blocked:supplier_discrepancy.resolve",
      ]),
    );
  });

  it("refuses to resolve a replacement by hand while it is still due", async () => {
    const order = await createPlacedOrder("SDR-DUE");
    const [supplierDiscrepancyId] = (await receive(order, "6")).supplierDiscrepancyIds;

    await agree(supplierDiscrepancyId, "replace", "4");

    await expect(resolve(supplierDiscrepancyId)).rejects.toThrow("still due");
  });

  it("lets the Custodian record an excess by hand without posting stock", async () => {
    const order = await createPlacedOrder("SDR-EXCESS");

    await receive(order, "10");

    const { supplierDiscrepancyId } = await createSupplierDiscrepancy(people.inventory_custodian, {
      purchaseOrderId: order.purchaseOrderId,
      purchaseOrderLineId: order.purchaseOrderLineId,
      affectedQty: "2",
      problem: "Two extra units held as disputed",
    });

    await expect(agree(supplierDiscrepancyId, "cancel", "2")).rejects.toThrow("no balance");
    expect(await listSupplierDiscrepancies(people.accounting_associate)).toEqual([
      expect.objectContaining({ supplierDiscrepancyId, commitment: null, status: "open" }),
    ]);
    expect(await onHand(order.itemId)).toBe("10.000");
    expect(await movements()).toHaveLength(1);
  });

  it("blocks the wrong role in each service", async () => {
    const order = await createPlacedOrder("SDR-ROLES");
    const [supplierDiscrepancyId] = (await receive(order, "6")).supplierDiscrepancyIds;

    await expect(
      createSupplierDiscrepancy(people.purchasing_staff, {
        purchaseOrderId: order.purchaseOrderId,
        purchaseOrderLineId: order.purchaseOrderLineId,
        affectedQty: "1",
        problem: "Wrong size",
      }),
    ).rejects.toThrow("Only the Inventory Custodian");
    await expect(
      updateSupplierDiscrepancy(people.purchasing_staff, {
        supplierDiscrepancyId,
        affectedQty: "1",
        problem: "Wrong size",
      }),
    ).rejects.toThrow("Only the Inventory Custodian");
    await expect(
      agree(supplierDiscrepancyId, "credit", "1", people.inventory_custodian),
    ).rejects.toThrow("Only Purchasing");
    await expect(resolve(supplierDiscrepancyId, people.accounting_associate)).rejects.toThrow(
      "can resolve",
    );
    await expect(listSupplierDiscrepancies(people.delivery_operations)).rejects.toThrow(
      "not allowed",
    );
    expect(await reports()).toHaveLength(1);
    expect((await reports())[0].status).toBe("open");
  });

  describe("actions", () => {
    async function signInAs(user: AppUser) {
      const [row] = await db
        .select({ authUserId: users.authUserId })
        .from(users)
        .where(eq(users.userId, user.userId));

      session.authUserId = row.authUserId;
    }

    function form(values: Record<string, string>) {
      const data = new FormData();

      for (const [name, value] of Object.entries(values)) {
        data.set(name, value);
      }

      return data;
    }

    it("records a report from a form with a blank receipt line, then agrees it", async () => {
      const order = await createPlacedOrder("SDR-ACTION");

      await signInAs(people.inventory_custodian);
      expect(
        await createSupplierDiscrepancyAction(
          null,
          form({
            purchaseOrderId: String(order.purchaseOrderId),
            purchaseOrderLineId: String(order.purchaseOrderLineId),
            supplierReceiptLineId: "",
            affectedQty: "2",
            problem: "Wrong item",
          }),
        ),
      ).toMatchObject({ ok: true });

      const [report] = await reports();
      const agreement = form({
        supplierDiscrepancyId: String(report.supplierDiscrepancyId),
        agreedAction: "replace",
        committedQty: "2",
        expectedDeliveryDate: "2026-12-04",
      });

      expect(await agreeSupplierDiscrepancyAction(null, agreement)).toMatchObject({ ok: false });

      await signInAs(people.purchasing_staff);
      expect(await agreeSupplierDiscrepancyAction(null, agreement)).toMatchObject({ ok: true });
      expect((await reports())[0].status).toBe("agreed");
    });
  });
});
