import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  dispatches,
  notifications,
  purchaseRequisitions,
  roles,
  requisitionLines,
  requisitions,
  requisitionStatusHistory,
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
import {
  listReadyForArPreparationService as listReadyForArPreparation,
  prepareAcknowledgementReceiptService as prepareAcknowledgementReceipt,
} from "./requisition.prep-AR.service";
import { rejectRequisitionService as rejectRequisition } from "./requisition.reject.service";
import { reserveRequisitionService as reserveRequisition } from "./requisition.reserve.service";
import { resubmitRequisitionService as resubmitRequisition } from "./requisition.resubmit.service";
import { submitRequisitionService as submitRequisition } from "./requisition.submit.service";
import { listPendingApprovalsService as listPendingApprovals } from "./requisition.lists.service";

// DB-backed coverage for the requisition lifecycle. Skipped unless
// TEST_DATABASE_URL is set (see src/test/test-env.ts), as in CI.

describeWithDatabase("requisition service", () => {
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

    const alerts = await db
      .select()
      .from(notifications)
      .where(eq(notifications.requisitionId, requisitionId));
    expect(
      alerts.some((alert) => alert.recipientUserId === people.inventory_custodian.userId),
    ).toBe(true);
    expect(await db.select().from(purchaseRequisitions)).toHaveLength(0);
  });

  it("shows each pending request only to its assigned approver", async () => {
    const assignedRequest = await submit("2");
    const [approverRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.roleName, "requisition_approver"));
    const [secondApprover] = await db
      .insert(users)
      .values({
        authUserId: crypto.randomUUID(),
        email: "second-approver@rcwheels.test",
        fullName: "Second Test Approver",
        roleId: approverRole.roleId,
      })
      .returning();
    const secondApproverId = secondApprover.userId;
    const [requesterRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.roleName, "requester"));
    const [secondRequesterRow] = await db
      .insert(users)
      .values({
        authUserId: crypto.randomUUID(),
        email: "second-requester@rcwheels.test",
        fullName: "Second Test Requester",
        roleId: requesterRole.roleId,
        approverId: secondApproverId,
      })
      .returning();
    const secondRequester: AppUser = {
      userId: secondRequesterRow.userId,
      email: secondRequesterRow.email,
      fullName: secondRequesterRow.fullName,
      role: "requester",
      approverId: secondApproverId,
    };
    const otherRequest = await submitRequisition(secondRequester, {
      purpose: "Another request",
      deliveryDate: todayInManila(),
      deliveryLocation: "Workshop bay 1",
      isUrgent: false,
      lines: [{ itemId, requestedQty: "1" }],
    });

    const queue = await listPendingApprovals(people.requisition_approver);

    expect(queue.map((request) => request.requisitionId)).toContain(assignedRequest.requisitionId);
    expect(queue.map((request) => request.requisitionId)).not.toContain(otherRequest.requisitionId);
  });

  it("blocks and audits a decision when the request has no assigned approver", async () => {
    const { requisitionId } = await submit("2");
    await db
      .update(users)
      .set({ approverId: null })
      .where(eq(users.userId, people.requester.userId));
    const line = await firstLine(requisitionId);

    await expect(
      approveRequisition(people.requisition_approver, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "2" }],
      }),
    ).rejects.toThrow("no assigned approver");

    const audits = await db.select().from(auditLog);
    expect(audits.some((entry) => entry.action === "blocked:requisition.approve")).toBe(true);
  });

  it("blocks and audits a rejection after the request is approved", async () => {
    const { requisitionId } = await submit("2");
    const line = await firstLine(requisitionId);
    await approveRequisition(people.requisition_approver, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "2" }],
    });

    await expect(
      rejectRequisition(people.requisition_approver, {
        requisitionId,
        reason: "This decision is too late",
      }),
    ).rejects.toThrow("Only a pending request can be decided.");

    const audits = await db.select().from(auditLog);
    expect(audits.some((entry) => entry.action === "blocked:requisition.reject")).toBe(true);
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

    const audits = await db.select().from(auditLog);
    expect(audits.some((entry) => entry.action === "blocked:requisition.approve")).toBe(true);
  });

  it("blocks and audits a requester trying to approve their own request", async () => {
    const { requisitionId } = await submit("2");
    await db
      .update(users)
      .set({ approverId: people.requester.userId })
      .where(eq(users.userId, people.requester.userId));
    const line = await firstLine(requisitionId);

    await expect(
      approveRequisition(people.requester, {
        requisitionId,
        lines: [{ requisitionLineId: line.requisitionLineId, approvedQty: "2" }],
      }),
    ).rejects.toThrow("cannot approve your own request");

    const audits = await db.select().from(auditLog);
    expect(audits.some((entry) => entry.action === "blocked:requisition.approve")).toBe(true);
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

  it("blocks and audits resubmission when the requester has no assigned approver", async () => {
    const { requisitionId } = await submit("2");
    await rejectRequisition(people.requisition_approver, {
      requisitionId,
      reason: "Correct the request",
    });

    const unassignedRequester = { ...people.requester, approverId: null };

    await expect(
      resubmitRequisition(unassignedRequester, {
        requisitionId,
        purpose: "Corrected request",
        deliveryDate: todayInManila(),
        deliveryLocation: "Workshop bay 1",
        isUrgent: false,
        lines: [{ itemId, requestedQty: "1" }],
      }),
    ).rejects.toThrow("no assigned approver");

    const audits = await db.select().from(auditLog);
    expect(audits.some((entry) => entry.action === "blocked:requisition.resubmit")).toBe(true);
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
  it("issues a partial quantity, then prepares and dispatches the reserved remainder (issue #31)", async () => {
    const { requisitionId, line } = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, quantity: "10" }],
    });

    const prepareFirst = () =>
      prepareAcknowledgementReceipt(people.inventory_custodian, {
        requisitionId,
        deliveryPersonnel: "Test Driver",
        lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "4" }],
      });

    await prepareFirst();

    // The open AR cannot be prepared twice before it is dispatched.
    await expect(prepareFirst()).rejects.toBeInstanceOf(BlockedActionError);
    expect((await listReadyForArPreparation()).map((r) => r.requisitionId)).not.toContain(
      requisitionId,
    );

    await dispatchRequisition(people.inventory_custodian, { requisitionId });
    expect(await onHand(itemId)).toBe("96.000");

    // The remainder stays reserved and open, and the request returns to the AR queue.
    const afterPartial = (await getRequisitionDetailService(people.inventory_custodian, requisitionId))!;
    expect(afterPartial.requisition.status).toBe("out_for_delivery");
    expect(afterPartial.lines[0]).toMatchObject({
      dispatchedQty: "4.000",
      reservedQty: "6.000",
      unissuedQty: "6.000",
    });
    expect((await listReadyForArPreparation()).map((r) => r.requisitionId)).toContain(
      requisitionId,
    );

    // A later issue cannot exceed what is still reserved.
    await expect(
      prepareAcknowledgementReceipt(people.inventory_custodian, {
        requisitionId,
        deliveryPersonnel: "Test Driver",
        lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "7" }],
      }),
    ).rejects.toThrow("Only 6 is reserved");

    await prepareAcknowledgementReceipt(people.inventory_custodian, {
      requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "6" }],
    });
    await dispatchRequisition(people.inventory_custodian, { requisitionId });

    expect(await onHand(itemId)).toBe("90.000");
    await expect(
      dispatchRequisition(people.inventory_custodian, { requisitionId }),
    ).rejects.toBeInstanceOf(BlockedActionError);
    expect(await onHand(itemId)).toBe("90.000");

    const done = (await getRequisitionDetailService(people.inventory_custodian, requisitionId))!;
    expect(done.lines[0]).toMatchObject({
      dispatchedQty: "10.000",
      reservedQty: "0.000",
      unissuedQty: "0.000",
    });
    expect(
      await db.select().from(dispatches).where(eq(dispatches.requisitionId, requisitionId)),
    ).toHaveLength(2);
    expect(done.history.map((entry) => entry.toStatus)).toEqual([
      "pending_approval",
      "approved",
      "for_delivery",
      "out_for_delivery",
      "for_delivery",
      "out_for_delivery",
    ]);
    expect((await listReadyForArPreparation()).map((r) => r.requisitionId)).not.toContain(
      requisitionId,
    );
  });

  it("dispatches a partial issue and deducts only the sent quantity", async () => {
    const { requisitionId, line } = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, quantity: "10" }],
    });

    await prepareAcknowledgementReceipt(people.inventory_custodian, {
      requisitionId,
      deliveryPersonnel: "Test Driver",
      lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "6" }],
    });
    await dispatchRequisition(people.inventory_custodian, { requisitionId });

    expect(await onHand(itemId)).toBe("94.000");

    const [header] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    expect(header.status).toBe("out_for_delivery");
  });

  it("refuses to send more than was reserved", async () => {
    const { requisitionId, line } = await approvedRequest("10");
    await reserveRequisition(people.inventory_custodian, {
      requisitionId,
      lines: [{ requisitionLineId: line.requisitionLineId, quantity: "5" }],
    });

    await expect(
      prepareAcknowledgementReceipt(people.inventory_custodian, {
        requisitionId,
        deliveryPersonnel: "Test Driver",
        lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "8" }],
      }),
    ).rejects.toBeInstanceOf(BlockedActionError);
    expect(await onHand(itemId)).toBe("100.000");
  });

  it("blocks AR preparation and dispatch for a request that is not ready", async () => {
    const { requisitionId, line } = await submit("5").then(async (r) => ({
      requisitionId: r.requisitionId,
      line: await firstLine(r.requisitionId),
    }));

    await expect(
      prepareAcknowledgementReceipt(people.inventory_custodian, {
        requisitionId,
        deliveryPersonnel: "Test Driver",
        lines: [{ requisitionLineId: line.requisitionLineId, sentQty: "5" }],
      }),
    ).rejects.toBeInstanceOf(BlockedActionError);

    await expect(
      dispatchRequisition(people.inventory_custodian, { requisitionId }),
    ).rejects.toBeInstanceOf(BlockedActionError);

    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "blocked:requisition.prepare-ar")).toBe(true);
    expect(audits.some((a) => a.action === "blocked:requisition.dispatch")).toBe(true);
    expect(await onHand(itemId)).toBe("100.000");
  });
});
