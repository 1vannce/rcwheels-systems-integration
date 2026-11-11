import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLog,
  notifications,
  requisitionLines,
  requisitionStatusHistory,
  requisitions,
  users as usersTable,
} from "@/db/schema";
import { todayInManila } from "@/modules/inventory";
import { createItem } from "@/test/stock-fixtures";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";

import type { AppRole } from "@/modules/core/types/role.type";
import type { AppUser } from "@/modules/core/types/user.type";
import type { CreateRequisitionInput } from "../schemas/requisition.schema";
import { createRequisition, listMyRequisitions } from "./requisition.service";

describeWithDatabase("requisition service", () => {
  let users: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
    await db
      .update(usersTable)
      .set({ approverId: users.requisition_approver.userId })
      .where(eq(usersTable.userId, users.requester.userId));
    users.requester = {
      ...users.requester,
      approverId: users.requisition_approver.userId,
    };
  });

  afterAll(closeDatabase);

  function input(itemIds: number[]): CreateRequisitionInput {
    return {
      requesterName: "Dante Abellana",
      purpose: "Replace worn tires before the next service shift",
      deliveryDate: todayInManila(),
      deliveryLocation: "Workshop bay 2",
      isUrgent: true,
      lines: itemIds.map((itemId, index) => ({
        itemId,
        quantity: String(index + 1),
      })),
    };
  }

  it("creates a pending RF with its lines, history, audit, and approver notification", async () => {
    const itemOne = await createItem("RF-TIRE-01");
    const itemTwo = await createItem("RF-TIRE-02");
    const { requisitionId } = await createRequisition(
      users.requester,
      input([itemOne, itemTwo]),
    );

    const [created] = await db
      .select()
      .from(requisitions)
      .where(eq(requisitions.requisitionId, requisitionId));
    const lines = await db
      .select()
      .from(requisitionLines)
      .where(eq(requisitionLines.requisitionId, requisitionId));
    const [history] = await db
      .select()
      .from(requisitionStatusHistory)
      .where(eq(requisitionStatusHistory.requisitionId, requisitionId));
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, requisitionId));
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.requisitionId, requisitionId));

    expect(created).toMatchObject({
      submittedBy: users.requester.userId,
      requesterName: "Dante Abellana",
      status: "pending_approval",
      deliveryDate: todayInManila(),
      deliveryLocation: "Workshop bay 2",
      isUrgent: true,
    });
    expect(lines).toHaveLength(2);
    expect(history).toMatchObject({
      changedBy: users.requester.userId,
      fromStatus: null,
      toStatus: "pending_approval",
    });
    expect(audit).toMatchObject({
      actorUserId: users.requester.userId,
      action: "requisition.create",
    });
    expect(notification).toMatchObject({
      recipientUserId: users.requisition_approver.userId,
      notificationType: "requisition.submitted",
    });

    expect(await listMyRequisitions(users.requester)).toHaveLength(1);
    expect(await listMyRequisitions(users.requisition_approver)).toHaveLength(0);
  });

  it("rejects a nonexistent item without leaving request, line, history, or notification rows", async () => {
    await expect(
      createRequisition(users.requester, input([987654321])),
    ).rejects.toThrow("One or more selected items do not exist.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    expect(await db.select().from(requisitionLines)).toHaveLength(0);
    expect(await db.select().from(requisitionStatusHistory)).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect((await db.select().from(auditLog))[0].action).toBe(
      "blocked:requisition.create",
    );
  });

  it("rejects a past delivery date before creating the RF", async () => {
    const itemId = await createItem("RF-TIRE-03");

    await expect(
      createRequisition(users.requester, {
        ...input([itemId]),
        deliveryDate: "2000-01-01",
      }),
    ).rejects.toThrow("Delivery date cannot be in the past.");

    expect(await db.select().from(requisitions)).toHaveLength(0);
    expect(await db.select().from(requisitionLines)).toHaveLength(0);
  });
});
