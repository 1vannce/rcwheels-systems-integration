import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";

import { ForbiddenError } from "../types/error.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { authorizeRole, authorizeScreen, roleIsAllowed } from "./authorization.service";

describe("roleIsAllowed", () => {
  it("allows only the listed roles", () => {
    const approvers: AppRole[] = ["inventory_manager"];

    expect(roleIsAllowed("inventory_manager", approvers)).toBe(true);
    expect(roleIsAllowed("inventory_custodian", approvers)).toBe(false);
    expect(roleIsAllowed("system_administrator", approvers)).toBe(false);
  });
});

describeWithDatabase("role checks against the audit log", () => {
  let users: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  it("lets an allowed role through without an audit entry", async () => {
    await authorizeRole(users.inventory_manager, ["inventory_manager"], "adjustment.approve");
    await authorizeScreen(users.inventory_manager, "inventory-adjustments");

    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("blocks another role's action and records it", async () => {
    const requester = users.requester;

    await expect(
      authorizeRole(requester, ["inventory_manager"], "adjustment.approve"),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: requester.userId,
      entityType: "users",
      entityId: requester.userId,
      action: "blocked:adjustment.approve",
    });
  });

  it("blocks another role's screen and records it", async () => {
    const requester = users.requester;

    await expect(
      authorizeScreen(requester, "inventory-item-list"),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("blocked:open-screen:inventory-item-list");
  });
});
