import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { auditLog, notifications } from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";

import { BlockedActionError } from "../types/error.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { recordAudit, runBusinessEvent } from "./audit.service";
import { notifyUsers } from "./notification.service";

describeWithDatabase("audit service", () => {
  let users: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  it("commits the audit entry together with the event", async () => {
    const actor = users.inventory_custodian;

    await runBusinessEvent(actor.userId, async (tx) => {
      await notifyUsers(tx, [users.inventory_manager.userId], {
        type: "test",
        message: "Count recorded",
      });
      await recordAudit(tx, {
        actorUserId: actor.userId,
        entityType: "items",
        entityId: 7,
        action: "item.create",
        details: { itemCode: "TST-001" },
      });
    });

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: actor.userId,
      entityType: "items",
      entityId: 7,
      action: "item.create",
      changeDetails: JSON.stringify({ itemCode: "TST-001" }),
    });
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("keeps the blocked-action entry when the event rolls back", async () => {
    const actor = users.inventory_custodian;

    await expect(
      runBusinessEvent(actor.userId, async (tx) => {
        await notifyUsers(tx, [users.inventory_manager.userId], {
          type: "test",
          message: "Should be rolled back",
        });
        await recordAudit(tx, {
          actorUserId: actor.userId,
          entityType: "items",
          entityId: 7,
          action: "item.create",
        });

        throw new BlockedActionError("Not enough stock.", {
          entityType: "items",
          entityId: 7,
          action: "stock.reserve",
          details: { requested: "5" },
        });
      }),
    ).rejects.toThrow("Not enough stock.");

    // Nothing from inside the transaction survives.
    expect(await db.select().from(notifications)).toHaveLength(0);

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: actor.userId,
      entityType: "items",
      entityId: 7,
      action: "blocked:stock.reserve",
    });
    expect(JSON.parse(entries[0].changeDetails!)).toEqual({
      reason: "Not enough stock.",
      requested: "5",
    });
  });

  it("writes no audit entry for an unexpected failure", async () => {
    await expect(
      runBusinessEvent(users.inventory_custodian.userId, async (tx) => {
        await recordAudit(tx, {
          actorUserId: null,
          entityType: "items",
          entityId: 1,
          action: "item.create",
        });

        throw new Error("connection lost");
      }),
    ).rejects.toThrow("connection lost");

    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});
