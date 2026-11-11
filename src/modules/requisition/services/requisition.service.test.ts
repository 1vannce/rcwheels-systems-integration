import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  dispatches,
  notifications,
  requisitionLines,
  requisitions,
  requisitionStatusHistory,
  users,
} from "@/db/schema";
import { BlockedActionError, type AppRole, type AppUser } from "@/modules/core";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, onHand } from "@/test/stock-fixtures";

import { approveRequisitionService as approveRequisition } from "./requisition.approve.service";
import { dispatchRequisitionService as dispatchRequisition } from "./requisition.dispatch.service";
import { prepareAcknowledgementReceiptService as prepareAcknowledgementReceipt } from "./requisition.prep-AR.service";
import { rejectRequisitionService as rejectRequisition } from "./requisition.reject.service";
import { reserveRequisitionService as reserveRequisition } from "./requisition.reserve.service";
import { resubmitRequisitionService as resubmitRequisition } from "./requisition.resubmit.service";
import { submitRequisitionService as submitRequisition } from "./requisition.submit.service";

// DB-backed coverage for the requisition lifecycle. Skipped unless
// TEST_DATABASE_URL is set (see src/test/test-env.ts), as in CI.

describeWithDatabase("requisition service", () => {
  let people: Record<AppRole, AppUser>;
  let itemId: number;

  beforeEach(async () => {
    await resetDatabase();
    people = await createUsersForEveryRole();
    itemId = await createItem("REQ-1", "100");
  });

  afterAll(closeDatabase);

  async function submit(quantity = "10", purpose = "Test request") {
    return submitRequisition(people.requester, {
      purpose,
      isUrgent: false,
      lines: [{ itemId, requestedQty: quantity }],
    });
  }

  async function firstLine(requisitionId: number) {
    const [line] = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    return line;
  }

  async function approvedRequest(quantity = "10") {
    const { requisitionId } = await submit(quantity);
    const line = await firstLine(requisitionId);

    await approveRequisition(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: quantity }],
    });

    return { requisitionId, line };
  }

  it("submits a request with its line, history, audit, and approver notification", async () => {
    const { requisitionId } = await submit("5");

    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const lines = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));
    const history = await db
      .select()
      .from(requisitionStatusHistory)
      .where(eq(requisitionStatusHistory.requisitionId, requisitionId));
    const alerts = await db
      .select()
      .from(notifications)
      .where(eq(notifications.requisitionId, requisitionId));
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, requisitionId));

    expect(header).toMatchObject({
      status: "pending_approval",
      requesterName: people.requester.fullName,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].requestedQty).toBe("5.000");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "pending_approval" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recipientUserId).toBe(people.requisition_approver.userId);
    expect(audits.some((row) => row.action === "requisition.submit")).toBe(true);
  });

  it("approves less than the requested quantity (BR-RQ-05)", async () => {
    const { requisitionId } = await submit("10");
    const line = await firstLine(requisitionId);

    await approveRequisition(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "6" }],
    });

    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const [updated] = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    expect(header.status).toBe("approved");
    expect(updated.approvedQty).toBe("6.000");
  });

  it("refuses an approval above the requested quantity", async () => {
    const { requisitionId } = await submit("5");
    const line = await firstLine(requisitionId);

    await expect(
      approveRequisition(people.requisition_approver, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "6" }],
      }),
    ).rejects.toThrow("cannot exceed");
  });

  it("refuses a decision from anyone but the assigned approver (BR-AC-07)", async () => {
    await db
      .update(users)
      .set({ approverId: people.requisition_approver.userId })
      .where(eq(users.userId, people.requester.userId));

    const { requisitionId } = await submit("5");
    const line = await firstLine(requisitionId);

    await expect(
      approveRequisition(people.system_administrator, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "5" }],
      }),
    ).rejects.toThrow("assigned approver");
  });

  it("rejects with a reason and resubmits without losing the history (BR-RQ-06)", async () => {
    const { requisitionId } = await submit("5");

    await rejectRequisition(people.requisition_approver, {
      requisitionId,
      reason: "Wrong quantity",
    });
    await resubmitRequisition(people.requester, {
      requisitionId,
      purpose: "Corrected",
      isUrgent: true,
      lines: [{ itemId, requestedQty: "8" }],
    });

    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const history = await db
      .select()
      .from(requisitionStatusHistory)
      .where(eq(requisitionStatusHistory.requisitionId, requisitionId));

    expect(header).toMatchObject({ status: "pending_approval", purpose: "Corrected", isUrgent: true });
    expect(history.map((row) => row.toStatus)).toEqual([
      "pending_approval",
      "rejected",
      "pending_approval",
    ]);
  });

  it("reserves fully, then moves to Awaiting Stock when the need exceeds availability", async () => {
    const first = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId: first.requisitionId,
      lines: [{ requisitionLineId: first.line.requisitionLineId, quantity: "10" }],
    });

    const [firstHeader] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, first.requisitionId));
    expect(firstHeader.status).toBe("approved");

    const second = await approvedRequest("200");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId: second.requisitionId,
      lines: [{ requisitionLineId: second.line.requisitionLineId, quantity: "90" }],
    });

    const [secondHeader] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, second.requisitionId));
    expect(secondHeader.status).toBe("awaiting_stock");
  });

  it("refuses to reserve more than the outstanding need", async () => {
    const { requisitionId, line } = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, quantity: "10" }],
    });

    await expect(
      reserveRequisition(people.inventory_custodian, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, quantity: "1" }],
      }),
    ).rejects.toThrow("can still be reserved");
  });

  it("prepares the AR and dispatches, deducting stock exactly once (BR-IN-04)", async () => {
    const { requisitionId, line } = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, quantity: "10" }],
    });

    const { dispatchId } = await prepareAcknowledgementReceipt(people.inventory_custodian, {
      requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "10" }],
    });

    const [prepared] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    expect(prepared.status).toBe("for_delivery");
    expect(await onHand(itemId)).toBe("100.000");

    await dispatchRequisition(people.inventory_custodian, { requisitionId });

    const [dispatched] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const [dispatch] = await db
      .select()
      .from(dispatches)
      .where(eq(dispatches.dispatchId, dispatchId));

    expect(dispatched.status).toBe("out_for_delivery");
    expect(dispatch.status).toBe("dispatched");
    expect(await onHand(itemId)).toBe("90.000");

    await expect(
      dispatchRequisition(people.inventory_custodian, { requisitionId }),
    ).rejects.toBeInstanceOf(BlockedActionError);
    expect(await onHand(itemId)).toBe("90.000");
  });
});
