import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  acknowledgementReceipts,
  dispatches,
  internalDiscrepancies,
  returnLines,
  stockMovements,
  users,
} from "@/db/schema";
import { BlockedActionError, type AppRole, type AppUser } from "@/modules/core";
import { todayInManila } from "@/modules/inventory";
import {
  approveRequisitionService,
  dispatchRequisitionService,
  getRequisitionDetailService,
  markRequisitionFulfilledService,
  prepareAcknowledgementReceiptService,
  reserveRequisitionService,
  submitRequisitionService,
} from "@/modules/requisition";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, onHand } from "@/test/stock-fixtures";

import { listDiscrepancies, resolveDiscrepancy } from "./discrepancy.service";
import {
  acceptDelivery,
  listDeliveriesToAccept,
  listInternalDeliveryQueue,
} from "./internal-delivery.service";
import {
  inspectReturnLine,
  listReturnLinesToInspect,
  listReturnsToReceive,
  receiveReturn,
} from "./return.service";

// DB-backed coverage for internal delivery (PLAN section 9, scenarios 1 to 3).
// Skipped unless TEST_DATABASE_URL is set, as in CI.

describeWithDatabase("internal delivery", () => {
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
    itemId = await createItem("DLV-1", "100");
  });

  afterAll(closeDatabase);

  /** Submits, approves, and reserves a one-line request for `quantity`. */
  async function reservedRequest(quantity: string) {
    const { requisitionId } = await submitRequisitionService(people.requester, {
      purpose: "Delivery test",
      deliveryDate: todayInManila(),
      deliveryLocation: "Bay 2",
      isUrgent: false,
      lines: [{ itemId, requestedQty: quantity }],
    });
    const detail = (await getRequisitionDetailService(people.requester, requisitionId))!;
    const requisitionLineId = detail.lines[0].requisitionLineId;

    await approveRequisitionService(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId, approvedQty: quantity }],
    });
    await reserveRequisitionService(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId, quantity }],
    });

    return { requisitionId, requisitionLineId };
  }

  /** Prepares and releases one dispatch of `sentQty`; returns its single line. */
  async function dispatch(requisitionId: number, requisitionLineId: number, sentQty: string) {
    const { dispatchId } = await prepareAcknowledgementReceiptService(people.inventory_custodian, {
      requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId, sentQty }],
    });
    await dispatchRequisitionService(people.inventory_custodian, { requisitionId });
    const [delivery] = (await listDeliveriesToAccept(people.requester)).filter(
      (row) => row.dispatchId === dispatchId,
    );

    return { dispatchId, dispatchLineId: delivery.lines[0].dispatchLineId };
  }

  async function status(requisitionId: number) {
    return (await getRequisitionDetailService(people.requisition_approver, requisitionId))!
      .requisition.status;
  }

  it("scenario 1: full acceptance signs the AR, deducts nothing more, and the approver marks it Fulfilled", async () => {
    const { requisitionId, requisitionLineId } = await reservedRequest("10");
    const { dispatchId, dispatchLineId } = await dispatch(requisitionId, requisitionLineId, "10");

    // Connector C: the released dispatch is in the Internal Delivery queue.
    expect((await listInternalDeliveryQueue()).map((row) => row.dispatchId)).toContain(dispatchId);
    expect(await onHand(itemId)).toBe("90.000");

    const accept = () =>
      acceptDelivery(people.requester, {
        dispatchId,
        lines: [{ dispatchLineId, acceptedQty: "10", rejectedQty: "0", problem: "" }],
      });

    await accept();

    const [receipt] = await db
      .select()
      .from(acknowledgementReceipts)
      .where(eq(acknowledgementReceipts.dispatchId, dispatchId));
    expect(receipt.signedBy).toBe(people.requester.userId);
    expect(receipt.signedAt).toBeInstanceOf(Date);

    // Acceptance deducts nothing (BR-IN-04) and posts once.
    expect(await onHand(itemId)).toBe("90.000");
    await expect(accept()).rejects.toBeInstanceOf(BlockedActionError);
    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.movementType, "acceptance")),
    ).toHaveLength(1);
    expect(await listInternalDeliveryQueue()).toHaveLength(0);

    expect(await status(requisitionId)).toBe("delivered");

    // Only the assigned approver may close it.
    await expect(
      markRequisitionFulfilledService(people.inventory_manager, { requisitionId }),
    ).rejects.toBeInstanceOf(BlockedActionError);
    await markRequisitionFulfilledService(people.requisition_approver, { requisitionId });
    expect(await status(requisitionId)).toBe("fulfilled");
  });

  it("scenario 2: partial issue and partial acceptance send the remainder back through connector F", async () => {
    const { requisitionId, requisitionLineId } = await reservedRequest("10");
    const first = await dispatch(requisitionId, requisitionLineId, "6");

    // 4 accepted, 2 rejected as an RDR.
    await acceptDelivery(people.requester, {
      dispatchId: first.dispatchId,
      lines: [
        {
          dispatchLineId: first.dispatchLineId,
          acceptedQty: "4",
          rejectedQty: "2",
          problem: "Cracked housing",
        },
      ],
    });
    expect(await status(requisitionId)).toBe("pending_resolution");

    const [rdr] = await listDiscrepancies(people.requisition_approver);
    expect(rdr).toMatchObject({ affectedQty: "2.000", status: "pending_resolution" });

    await receiveReturn(people.delivery_operations, {
      internalDiscrepancyId: rdr.internalDiscrepancyId,
      returnedQty: "2",
    });
    await resolveDiscrepancy(people.requisition_approver, {
      internalDiscrepancyId: rdr.internalDiscrepancyId,
      decision: "replace",
      note: "Send a new unit",
    });

    // The 4 still reserved plus the 2 to replace return to the Inventory queue.
    const detail = (await getRequisitionDetailService(people.requisition_approver, requisitionId))!;
    expect(detail.requisition.status).toBe("approved");
    expect(detail.lines[0]).toMatchObject({
      acceptedQty: "4.000",
      returnedQty: "2.000",
      reservedQty: "4.000",
      unissuedQty: "6.000",
      reservableQty: "2.000",
      outstandingQty: "6.000",
    });

    await reserveRequisitionService(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId, quantity: "2" }],
    });
    // Each dispatch line draws on one reservation, so the reserved 4 and the
    // new 2 go out as two deliveries; each acceptance sends the rest back
    // through connector F until nothing is left to issue.
    for (const sentQty of ["4", "2"]) {
      const next = await dispatch(requisitionId, requisitionLineId, sentQty);
      await acceptDelivery(people.requester, {
        dispatchId: next.dispatchId,
        lines: [
          { dispatchLineId: next.dispatchLineId, acceptedQty: sentQty, rejectedQty: "0", problem: "" },
        ],
      });
      expect(await status(requisitionId)).toBe(sentQty === "4" ? "approved" : "delivered");
    }
    // 6 + 6 left usable stock; the 2 returned items are still held.
    expect(await onHand(itemId)).toBe("88.000");
    expect(await onHand(itemId, "hold")).toBe("2.000");
  });

  it("scenario 3: rejected items go to the right balance after inspection, once each", async () => {
    const { requisitionId, requisitionLineId } = await reservedRequest("9");
    const { dispatchId, dispatchLineId } = await dispatch(requisitionId, requisitionLineId, "9");

    await acceptDelivery(people.requester, {
      dispatchId,
      lines: [{ dispatchLineId, acceptedQty: "0", rejectedQty: "9", problem: "Wrong model" }],
    });
    expect(await status(requisitionId)).toBe("pending_resolution");

    const [rdr] = await listReturnsToReceive();

    // A return cannot exceed the reported quantity.
    await expect(
      receiveReturn(people.inventory_custodian, {
        internalDiscrepancyId: rdr.internalDiscrepancyId,
        returnedQty: "10",
      }),
    ).rejects.toThrow("Only 9 is still to be returned");

    for (const returnedQty of ["3", "3", "3"]) {
      await receiveReturn(people.inventory_custodian, {
        internalDiscrepancyId: rdr.internalDiscrepancyId,
        returnedQty,
      });
    }
    expect(await listReturnsToReceive()).toHaveLength(0);
    expect(await onHand(itemId, "hold")).toBe("9.000");

    const [usable, damaged, uncertain] = await listReturnLinesToInspect();
    await inspectReturnLine(people.inventory_custodian, {
      returnLineId: usable.returnLineId,
      result: "usable",
    });
    await inspectReturnLine(people.inventory_custodian, {
      returnLineId: damaged.returnLineId,
      result: "damaged",
    });
    await inspectReturnLine(people.inventory_custodian, {
      returnLineId: uncertain.returnLineId,
      result: "uncertain",
    });

    // A second inspection of a posted line is refused; the uncertain one stays listed.
    await expect(
      inspectReturnLine(people.inventory_custodian, {
        returnLineId: usable.returnLineId,
        result: "damaged",
      }),
    ).rejects.toBeInstanceOf(BlockedActionError);
    const stillHeld = await listReturnLinesToInspect();
    expect(stillHeld.map((row) => row.returnLineId)).toEqual([uncertain.returnLineId]);
    expect(stillHeld[0].inspectedAt).toBeInstanceOf(Date);

    expect(await onHand(itemId)).toBe("94.000");
    expect(await onHand(itemId, "damaged")).toBe("3.000");
    expect(await onHand(itemId, "hold")).toBe("3.000");

    // Reinspection of the uncertain line can still post it.
    await inspectReturnLine(people.inventory_custodian, {
      returnLineId: uncertain.returnLineId,
      result: "usable",
    });
    expect(await onHand(itemId)).toBe("97.000");
    expect(await onHand(itemId, "hold")).toBe("0.000");

    // The approver cancels the rejected quantity; the request is never Rejected.
    await resolveDiscrepancy(people.requisition_approver, {
      internalDiscrepancyId: rdr.internalDiscrepancyId,
      decision: "cancel",
      note: "No longer needed",
    });
    const detail = (await getRequisitionDetailService(people.requisition_approver, requisitionId))!;
    expect(detail.requisition.status).toBe("delivered");
    expect(detail.lines[0]).toMatchObject({ cancelledQty: "9.000", outstandingQty: "0.000" });
    expect(detail.history.map((entry) => entry.toStatus)).not.toContain("rejected");

    const [resolved] = await db
      .select()
      .from(internalDiscrepancies)
      .where(eq(internalDiscrepancies.internalDiscrepancyId, rdr.internalDiscrepancyId));
    expect(resolved).toMatchObject({
      status: "cancelled",
      resolvedBy: people.requisition_approver.userId,
    });
    expect(
      await db
        .select()
        .from(returnLines)
        .where(and(eq(returnLines.condition, "hold"))),
    ).toHaveLength(0);
  });

  it("refuses a signature from anyone but the recipient and a split that does not add up", async () => {
    const { requisitionId, requisitionLineId } = await reservedRequest("5");
    const { dispatchId, dispatchLineId } = await dispatch(requisitionId, requisitionLineId, "5");

    await expect(
      acceptDelivery(people.delivery_operations, {
        dispatchId,
        lines: [{ dispatchLineId, acceptedQty: "5", rejectedQty: "0", problem: "" }],
      }),
    ).rejects.toThrow("Only the person the items were requested for");

    await expect(
      acceptDelivery(people.requester, {
        dispatchId,
        lines: [{ dispatchLineId, acceptedQty: "3", rejectedQty: "1", problem: "Bent" }],
      }),
    ).rejects.toThrow("must add up to the 5 delivered");

    const [receipt] = await db
      .select()
      .from(acknowledgementReceipts)
      .where(eq(acknowledgementReceipts.dispatchId, dispatchId));
    expect(receipt.signedAt).toBeNull();
    expect(await status(requisitionId)).toBe("out_for_delivery");
  });

  it("refuses an RDR decision from anyone but the assigned approver, and a second decision", async () => {
    const { requisitionId, requisitionLineId } = await reservedRequest("2");
    const { dispatchId, dispatchLineId } = await dispatch(requisitionId, requisitionLineId, "2");
    await acceptDelivery(people.requester, {
      dispatchId,
      lines: [{ dispatchLineId, acceptedQty: "1", rejectedQty: "1", problem: "Missing screws" }],
    });
    const [rdr] = await listDiscrepancies(people.requester);

    await expect(
      resolveDiscrepancy(people.inventory_manager, {
        internalDiscrepancyId: rdr.internalDiscrepancyId,
        decision: "cancel",
        note: "Not mine",
      }),
    ).rejects.toThrow("assigned approver");

    await resolveDiscrepancy(people.requisition_approver, {
      internalDiscrepancyId: rdr.internalDiscrepancyId,
      decision: "replace",
      note: "Replace it",
    });
    await expect(
      resolveDiscrepancy(people.requisition_approver, {
        internalDiscrepancyId: rdr.internalDiscrepancyId,
        decision: "cancel",
        note: "Changed mind",
      }),
    ).rejects.toThrow("already resolved");

    // Replacement approved but items not yet back: still out for delivery.
    expect(await status(requisitionId)).toBe("out_for_delivery");
    expect(
      await db.select().from(dispatches).where(eq(dispatches.requisitionId, requisitionId)),
    ).toHaveLength(1);
  });
});
