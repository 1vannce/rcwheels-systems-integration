import { afterAll, beforeEach, expect, it } from "vitest";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";

import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyRoles,
  notifyUsers,
} from "./notification.service";

describeWithDatabase("notification service", () => {
  let users: Record<AppRole, AppUser>;

  beforeEach(async () => {
    await resetDatabase();
    users = await createUsersForEveryRole();
  });

  afterAll(closeDatabase);

  it("notifies each recipient once", async () => {
    const manager = users.inventory_manager;

    await notifyUsers(db, [manager.userId, manager.userId], {
      type: "adjustment.requested",
      message: "A stock count needs approval.",
    });

    const list = await listNotifications(manager);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      notificationType: "adjustment.requested",
      message: "A stock count needs approval.",
      readAt: null,
    });
  });

  it("notifies the holders of a role, except the person who caused the event", async () => {
    await notifyRoles(
      db,
      ["inventory_custodian", "inventory_manager"],
      { type: "stock.incomplete", message: "Balance flagged incomplete." },
      users.inventory_custodian.userId,
    );

    const rows = await db.select().from(notifications);

    expect(rows.map((row) => row.recipientUserId)).toEqual([
      users.inventory_manager.userId,
    ]);
  });

  it("lets a user mark only their own notifications as read", async () => {
    const manager = users.inventory_manager;

    await notifyUsers(db, [manager.userId], { type: "test", message: "One" });
    await notifyUsers(db, [manager.userId], { type: "test", message: "Two" });

    const [first] = await listNotifications(manager);

    expect(await countUnreadNotifications(manager)).toBe(2);
    expect(await markNotificationRead(users.requester, first.notificationId)).toBe(false);
    expect(await countUnreadNotifications(manager)).toBe(2);

    expect(await markNotificationRead(manager, first.notificationId)).toBe(true);
    expect(await countUnreadNotifications(manager)).toBe(1);

    expect(await markAllNotificationsRead(manager)).toBe(1);
    expect(await countUnreadNotifications(manager)).toBe(0);
  });
});
