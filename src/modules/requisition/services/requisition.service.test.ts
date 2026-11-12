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
  roles,
  users,
} from "@/db/schema";
import { BlockedActionError, type AppRole, type AppUser } from "@/modules/core";
import { todayInManila } from "@/modules/inventory";
import { CreateRequisitionDto } from "../schemas/requisition.dto";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";
import { createItem, onHand } from "@/test/stock-fixtures";

import { approveRequisitionService as approveRequisition } from "./requisition.approve.service";
import { dispatchRequisitionService as dispatchRequisition } from "./requisition.dispatch.service";
import { getRequisitionDetailService } from "./requisition.get-details.service";
import { listActiveMechanicsService, listMyRequestsService } from "./requisition.lists.service";
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
    people.requester.approverId = people.requisition_approver.userId;
    await db
      .update(users)
      .set({ approverId: people.requisition_approver.userId })
      .where(eq(users.userId, people.requester.userId));
    itemId = await createItem("REQ-1", "100");
  });

  afterAll(closeDatabase);

  async function submit(
    quantity = "10",
    purpose = "Test request",
    actor = people.requester,
    requestedForUserId?: number,
  ) {
    return submitRequisition(actor, {
      ...(requestedForUserId === undefined ? {} : { requestedForUserId }),
      purpose,
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
      isUrgent: false,
      lines: [{ itemId, requestedQty: quantity }],
    });
  }

  async function createRequester(
    email: string,
    fullName: string,
    isMechanic = false,
  ): Promise<AppUser> {
    const [requesterRole] = await db
      .select({ roleId: roles.roleId })
      .from(roles)
      .where(eq(roles.roleName, "requester"));
    const [row] = await db
      .insert(users)
      .values({
        authUserId: crypto.randomUUID(),
        email,
        fullName,
        roleId: requesterRole.roleId,
        approverId: people.requisition_approver.userId,
        isMechanic,
      })
      .returning();

    return {
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: "requester",
      approverId: row.approverId,
    };
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
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].requestedQty).toBe("5.000");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: null, toStatus: "pending_approval" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recipientUserId).toBe(people.requisition_approver.userId);
    expect(audits.some((row) => row.action === "requisition.submit")).toBe(true);
  });

  it("creates a multi-line urgent request for an active mechanic (BR-RQ-01/02/03/04/15)", async () => {
    const mechanic = await createRequester("mechanic@rcwheels.test", "Test Mechanic", true);
    const secondItemId = await createItem("REQ-2", "30");
    const { requisitionId } = await submitRequisition(people.requester, {
      requestedForUserId: mechanic.userId,
      purpose: "Replace worn workshop tires",
      deliveryDate: todayInManila(),
      deliveryLocation: "Workshop bay 2",
      isUrgent: true,
      lines: [
        { itemId, requestedQty: "2" },
        { itemId: secondItemId, requestedQty: "1.25" },
      ],
    });
    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const lines = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));

    expect(header).toMatchObject({
      submittedBy: people.requester.userId,
      requestedForUserId: mechanic.userId,
      requesterName: mechanic.fullName,
      status: "pending_approval",
      isUrgent: true,
    });
    expect(lines.map((line) => line.requestedQty)).toEqual(["2.000", "1.250"]);
  });

  it("rejects a requester without an assigned approver and audits the block (BR-RQ-04/AC-07)", async () => {
    await db
      .update(users)
      .set({ approverId: null })
      .where(eq(users.userId, people.requester.userId));

    await expect(
      submitRequisition({ ...people.requester, approverId: null }, {
        purpose: "Needs an assigned approver",
        deliveryDate: todayInManila(),
        deliveryLocation: "Test workshop",
        isUrgent: false,
        lines: [{ itemId, requestedQty: "1" }],
      }),
    ).rejects.toThrow("Your account does not have an assigned approver.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    const audits = await db.select().from(auditLog);
    expect(audits).toContainEqual(
      expect.objectContaining({
        actorUserId: people.requester.userId,
        action: "blocked:requisition.submit",
      }),
    );
  });

  it("rejects an unlisted item without persisting or auditing (BR-RQ-02)", async () => {
    await expect(
      submitRequisition(people.requester, {
        purpose: "Removed item",
        deliveryDate: todayInManila(),
        deliveryLocation: "Test workshop",
        isUrgent: false,
        lines: [{ itemId: itemId + 1000, requestedQty: "1" }],
      }),
    ).rejects.toThrow("One or more selected items no longer exist.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    expect(await db.select().from(requisitionLines)).toHaveLength(0);
    expect(await db.select().from(requisitionStatusHistory)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("rejects an unlisted recipient without persisting or auditing (BR-RQ-01)", async () => {
    await expect(
      submit("1", "Invalid recipient", people.requester, people.inventory_custodian.userId),
    ).rejects.toThrow("Select an active mechanic from the list.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    expect(await db.select().from(requisitionLines)).toHaveLength(0);
    expect(await db.select().from(requisitionStatusHistory)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("ignores browser-supplied submitter, role, and status (BR-AC-03)", async () => {
    const parsed = CreateRequisitionDto.parse({
      requestedForUserId: "",
      purpose: "Server-owned fields stay trusted",
      deliveryDate: todayInManila(),
      deliveryLocation: "Test workshop",
      isUrgent: false,
      lines: [{ itemId, requestedQty: "1" }],
      submittedBy: people.system_administrator.userId,
      role: "system_administrator",
      status: "approved",
    });
    const { requisitionId } = await submitRequisition(people.requester, parsed);
    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));

    expect(header.submittedBy).toBe(people.requester.userId);
    expect(header.status).toBe("pending_approval");
  });

  it("lists requests submitted by or filed for the signed-in mechanic and audits hidden access (BR-AC-03)", async () => {
    const mechanic = await createRequester("mechanic-view@rcwheels.test", "Test Mechanic", true);
    const otherRequester = await createRequester("other-requester@rcwheels.test", "Other Requester");
    const own = await submit("1", "My request");
    const forMechanic = await submit("2", "For the mechanic", people.requester, mechanic.userId);
    const others = await submit("3", "Another request", otherRequester);

    const mechanicOptions = await listActiveMechanicsService();
    const requesterRows = await listMyRequestsService(people.requester);
    const mechanicRows = await listMyRequestsService(mechanic);
    const otherRows = await listMyRequestsService(otherRequester);
    const mechanicDetail = await getRequisitionDetailService(mechanic, forMechanic.requisitionId);
    const hiddenDetail = await getRequisitionDetailService(otherRequester, forMechanic.requisitionId);
    const accessAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, forMechanic.requisitionId));

    expect(mechanicOptions).toContainEqual({ userId: mechanic.userId, fullName: mechanic.fullName });
    expect(mechanicOptions).not.toContainEqual({
      userId: otherRequester.userId,
      fullName: otherRequester.fullName,
    });
    expect(requesterRows.map((row) => row.requisitionId).sort()).toEqual(
      [own.requisitionId, forMechanic.requisitionId].sort(),
    );
    expect(mechanicRows.map((row) => row.requisitionId)).toEqual([forMechanic.requisitionId]);
    expect(mechanicRows[0]).toMatchObject({ status: "pending_approval", lineCount: 1 });
    expect(otherRows.map((row) => row.requisitionId)).toEqual([others.requisitionId]);
    expect(mechanicDetail?.requisition.requestedForUserId).toBe(mechanic.userId);
    expect(hiddenDetail).toBeNull();
    expect(accessAudits).toContainEqual(
      expect.objectContaining({
        actorUserId: otherRequester.userId,
        action: "blocked:requisition.view",
      }),
    );
  });

  it("rejects a delivery date in the past", async () => {
    const yesterday = new Date(`${todayInManila()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await expect(
      submitRequisition(people.requester, {
        purpose: "Past date",
        deliveryDate: yesterday.toISOString().slice(0, 10),
        deliveryLocation: "Test workshop",
        isUrgent: false,
        lines: [{ itemId, requestedQty: "1" }],
      }),
    ).rejects.toThrow("Delivery date cannot be in the past.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    expect(await db.select().from(requisitionLines)).toHaveLength(0);
    expect(await db.select().from(requisitionStatusHistory)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
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
      deliveryDate: todayInManila(),
      deliveryLocation: "Corrected workshop",
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

    expect(header).toMatchObject({
      status: "pending_approval",
      purpose: "Corrected",
      deliveryDate: todayInManila(),
      deliveryLocation: "Corrected workshop",
      isUrgent: true,
    });
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
