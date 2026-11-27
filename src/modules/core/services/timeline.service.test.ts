import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { requisitionLines, suppliers, users } from "@/db/schema";
import {
  acceptDelivery,
  inspectReturnLine,
  receiveReturn,
  receiveSupplierDelivery,
  resolveDiscrepancy,
} from "@/modules/delivery";
import { todayInManila } from "@/modules/inventory";
import {
  approvePurchaseOrderService,
  createPurchaseOrderService,
  createShortagePurchaseRequisitionService,
  getPurchaseOrderEditContextService,
  placePurchaseOrderService,
} from "@/modules/purchasing";
import {
  approveRequisitionService,
  dispatchRequisitionService,
  markAwaitingStockService,
  markRequisitionFulfilledService,
  prepareAcknowledgementReceiptService,
  rejectRequisitionService,
  reserveRequisitionService,
  submitRequisitionService,
} from "@/modules/requisition";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem } from "@/test/stock-fixtures";

import type { AppRole } from "../types/role.type";
import type { TimelineEvent } from "../types/timeline.type";
import type { AppUser } from "../types/user.type";
import { getRequisitionTimeline } from "./timeline.service";

describeWithDatabase("requisition timeline", () => {
  let people: Record<AppRole, AppUser>;
  let itemId: number;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    await db
      .update(users)
      .set({ approverId: people.requisition_approver.userId })
      .where(eq(users.userId, people.requester.userId));
    people.requester = { ...people.requester, approverId: people.requisition_approver.userId };
    itemId = await createItem("TL-1", "0");
  });

  afterAll(closeDatabase);

  async function submit(purpose = "Timeline test") {
    const { requisitionId } = await submitRequisitionService(people.requester, {
      purpose,
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
      isUrgent: false,
      lines: [{ itemId, requestedQty: "10" }],
    });
    const [line] = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    return { requisitionId, requisitionLineId: line.requisitionLineId };
  }

  /** Reserves, prepares the AR, and dispatches one quantity. */
  async function issue(
    request: { requisitionId: number; requisitionLineId: number },
    quantity: string,
  ) {
    const { requisitionId, requisitionLineId } = request;

    await reserveRequisitionService(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId, quantity }],
    });
    const prepared = await prepareAcknowledgementReceiptService(people.inventory_custodian, {
      requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId, sentQty: quantity }],
    });
    await dispatchRequisitionService(people.inventory_custodian, { requisitionId });

    return prepared;
  }

  async function dispatchLineOf(dispatchId: number) {
    const rows = await db.query.dispatchLines.findMany({
      where: (line, { eq: equals }) => equals(line.dispatchId, dispatchId),
    });

    return rows[0].dispatchLineId;
  }

  const kinds = (events: TimelineEvent[]) => events.map((event) => event.kind);

  function recordsOf(events: TimelineEvent[], kind: TimelineEvent["kind"]) {
    return events.find((event) => event.kind === kind)?.records;
  }

  it("returns only its own events for a request with no downstream records", async () => {
    const other = await submit("Another request");
    await rejectRequisitionService(people.requisition_approver, {
      requisitionId: other.requisitionId,
      reason: "Wrong quantity",
    });
    const { requisitionId } = await submit();

    const events = await getRequisitionTimeline(people.requester, requisitionId);

    expect(kinds(events)).toEqual(["created"]);
    expect(events[0]).toMatchObject({
      title: "Request submitted",
      actorName: people.requester.fullName,
      records: [],
    });

    const rejected = await getRequisitionTimeline(people.requester, other.requisitionId);
    expect(kinds(rejected)).toEqual(["created", "rejected"]);
    expect(rejected[1].note).toBe("Wrong quantity");
  });

  it("traces a shortage through purchasing, receiving, and delivery in order", async () => {
    const request = await submit();
    const { requisitionId, requisitionLineId } = request;
    const timeline = (role: AppRole) => getRequisitionTimeline(people[role], requisitionId);

    await approveRequisitionService(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId, approvedQty: "10" }],
    });
    await markAwaitingStockService(people.inventory_custodian, requisitionId);
    const { purchaseRequisitionId } = await createShortagePurchaseRequisitionService(
      people.inventory_custodian,
      { requisitionId, lines: [{ requisitionLineId, requestedQty: "10" }] },
    );
    const prNumber = `PR-${String(purchaseRequisitionId).padStart(4, "0")}`;

    // The PR links to the queue while the queue still lists it.
    expect(recordsOf(await timeline("system_administrator"), "pr_created")).toEqual([
      { number: prNumber, href: "/purchasing/requisitions" },
    ]);
    expect(recordsOf(await timeline("inventory_custodian"), "pr_created")).toEqual([
      { number: prNumber, href: null },
    ]);

    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Sugbo Tire Trading" })
      .returning();
    const prLine = await db.query.purchaseRequisitionLines.findFirst();
    const { purchaseOrderId } = await createPurchaseOrderService(people.purchasing_staff, {
      purchaseRequisitionId,
      supplierId: supplier.supplierId,
      deliveryTerms: null,
      lines: [
        {
          purchaseRequisitionLineId: prLine!.purchaseRequisitionLineId,
          orderedQty: "10",
          unitPrice: "100",
        },
      ],
    });
    await approvePurchaseOrderService(people.accounting_associate, {
      purchaseOrderId,
      reason: "Budget available",
    });
    await placePurchaseOrderService(people.purchasing_staff, { purchaseOrderId });
    const order = await getPurchaseOrderEditContextService(
      people.purchasing_staff,
      purchaseOrderId,
    );
    const purchaseOrderLineId = order!.order.lines[0].purchaseOrderLineId;
    const receive = (quantity: string, deliveryReceiptNo: string) =>
      receiveSupplierDelivery(people.inventory_custodian, {
        purchaseOrderId,
        deliveryReceiptNo,
        invoiceNo: "",
        lines: [
          {
            purchaseOrderLineId,
            deliveredQty: quantity,
            acceptedQty: quantity,
            rejectedQty: "0",
            inspectionNotes: "",
          },
        ],
      });

    await receive("6", "DR-1");
    const first = await issue(request, "6");

    // An AR waiting for a signature links to the acceptance page.
    const arNumber = `AR-${String(first.acknowledgementReceiptId).padStart(4, "0")}`;
    expect(recordsOf(await timeline("requester"), "dispatched")).toEqual([
      { number: arNumber, href: "/delivery/acceptance" },
    ]);
    expect(recordsOf(await timeline("inventory_custodian"), "dispatched")).toEqual([
      { number: arNumber, href: null },
    ]);

    const { discrepancyIds } = await acceptDelivery(people.requester, {
      dispatchId: first.dispatchId,
      lines: [
        {
          dispatchLineId: await dispatchLineOf(first.dispatchId),
          acceptedQty: "5",
          rejectedQty: "1",
          problem: "Damaged",
        },
      ],
    });
    const { returnLineId } = await receiveReturn(people.delivery_operations, {
      internalDiscrepancyId: discrepancyIds[0],
      returnedQty: "1",
    });
    await inspectReturnLine(people.inventory_custodian, { returnLineId, result: "damaged" });
    await resolveDiscrepancy(people.requisition_approver, {
      internalDiscrepancyId: discrepancyIds[0],
      decision: "cancel",
      note: "No longer needed",
    });

    await receive("4", "DR-2");
    const second = await issue(request, "4");
    await acceptDelivery(people.requester, {
      dispatchId: second.dispatchId,
      lines: [
        {
          dispatchLineId: await dispatchLineOf(second.dispatchId),
          acceptedQty: "4",
          rejectedQty: "0",
          problem: "",
        },
      ],
    });
    await markRequisitionFulfilledService(people.requisition_approver, { requisitionId });

    const events = await timeline("system_administrator");

    expect(kinds(events)).toEqual([
      "created",
      "approved",
      "awaiting_stock",
      "pr_created",
      "po_created",
      "po_approved",
      "po_placed",
      "supplier_receipt",
      "po_partially_received",
      "sdr_opened",
      "stock_arrived",
      "reserved",
      "ar_prepared",
      "dispatched",
      "delivery_decided",
      "rdr_opened",
      "return_received",
      "return_inspected",
      "rdr_resolved",
      "supplier_receipt",
      "po_closed",
      "reserved",
      "ar_prepared",
      "dispatched",
      "delivery_decided",
      "delivered",
      "fulfilled",
    ]);
    expect(new Set(events.map((event) => event.key)).size).toBe(events.length);

    const times = events.map((event) => event.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    const poNumber = `PO-${String(purchaseOrderId).padStart(4, "0")}`;
    const reviewHref = `/purchasing/accounting-review/${purchaseOrderId}`;
    expect(recordsOf(events, "po_placed")).toEqual([{ number: poNumber, href: reviewHref }]);
    expect(recordsOf(events, "stock_arrived")).toEqual([{ number: poNumber, href: reviewHref }]);
    expect(recordsOf(events, "sdr_opened")).toEqual([
      { number: "SDR-0001", href: null },
      { number: poNumber, href: reviewHref },
    ]);
    // A covered PR has left the queue, and a signed AR the acceptance page.
    expect(recordsOf(events, "pr_created")).toEqual([{ number: prNumber, href: null }]);
    expect(recordsOf(events, "dispatched")).toEqual([{ number: arNumber, href: null }]);

    // Purchasing opens the PO editor; roles without a PO page get plain text.
    expect(recordsOf(await timeline("purchasing_staff"), "po_placed")).toEqual([
      { number: poNumber, href: `/purchasing/orders/${purchaseOrderId}` },
    ]);
    expect(recordsOf(await timeline("accounting_associate"), "po_placed")).toEqual([
      { number: poNumber, href: reviewHref },
    ]);
    expect(recordsOf(await timeline("requester"), "po_placed")).toEqual([
      { number: poNumber, href: null },
    ]);
  });
});
