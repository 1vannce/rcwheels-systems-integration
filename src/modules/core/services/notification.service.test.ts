import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tx } from "@/db";

import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";

// Unit tests: the database and repositories are mocked, so no connection is
// opened. Only the service's own rules (de-duplication, filtering, limit,
// boolean conversion) are exercised here.
const database = vi.hoisted(() => ({ db: {} }));

const repositories = vi.hoisted(() => ({
  insertNotifications: vi.fn(),
  findNotificationsByRecipient: vi.fn(),
  countUnreadByRecipient: vi.fn(),
  markReadForRecipient: vi.fn(),
  findActiveUserIdsByRoles: vi.fn(),
}));

vi.mock("@/db", () => ({ db: database.db }));
vi.mock("../repositories/notification.repository", () => ({
  insertNotifications: repositories.insertNotifications,
  findNotificationsByRecipient: repositories.findNotificationsByRecipient,
  countUnreadByRecipient: repositories.countUnreadByRecipient,
  markReadForRecipient: repositories.markReadForRecipient,
}));
vi.mock("../repositories/user.repository", () => ({
  findActiveUserIdsByRoles: repositories.findActiveUserIdsByRoles,
}));

import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyRoles,
  notifyUsers,
} from "./notification.service";

const tx = {} as Tx;

function user(userId: number, role: AppRole = "requester"): AppUser {
  return {
    userId,
    email: `user${userId}@rcwheels.test`,
    fullName: `User ${userId}`,
    role,
    approverId: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyUsers", () => {
  it("notifies each recipient once and maps the content", async () => {
    await notifyUsers(tx, [2, 2, 3], {
      type: "adjustment.requested",
      message: "A stock count needs approval.",
      requisitionId: 9,
    });

    expect(repositories.insertNotifications).toHaveBeenCalledWith(tx, [
      {
        recipientUserId: 2,
        requisitionId: 9,
        notificationType: "adjustment.requested",
        message: "A stock count needs approval.",
      },
      {
        recipientUserId: 3,
        requisitionId: 9,
        notificationType: "adjustment.requested",
        message: "A stock count needs approval.",
      },
    ]);
  });

  it("uses a null requisition when the content has none", async () => {
    await notifyUsers(tx, [2], { type: "test", message: "Hello" });

    expect(repositories.insertNotifications).toHaveBeenCalledWith(tx, [
      {
        recipientUserId: 2,
        requisitionId: null,
        notificationType: "test",
        message: "Hello",
      },
    ]);
  });
});

describe("notifyRoles", () => {
  it("resolves role holders and leaves out the person who caused the event", async () => {
    repositories.findActiveUserIdsByRoles.mockResolvedValue([2, 3, 4]);

    await notifyRoles(
      tx,
      ["inventory_custodian", "inventory_manager"],
      { type: "stock.incomplete", message: "Balance flagged incomplete." },
      3,
    );

    expect(repositories.findActiveUserIdsByRoles).toHaveBeenCalledWith(tx, [
      "inventory_custodian",
      "inventory_manager",
    ]);
    expect(repositories.insertNotifications).toHaveBeenCalledWith(tx, [
      {
        recipientUserId: 2,
        requisitionId: null,
        notificationType: "stock.incomplete",
        message: "Balance flagged incomplete.",
      },
      {
        recipientUserId: 4,
        requisitionId: null,
        notificationType: "stock.incomplete",
        message: "Balance flagged incomplete.",
      },
    ]);
  });
});

describe("notification reads", () => {
  it("lists at most 100 notifications for the signed-in user", async () => {
    repositories.findNotificationsByRecipient.mockResolvedValue([]);

    await listNotifications(user(9));

    expect(repositories.findNotificationsByRecipient).toHaveBeenCalledWith(
      database.db,
      9,
      100,
    );
  });

  it("counts unread notifications for the signed-in user", async () => {
    repositories.countUnreadByRecipient.mockResolvedValue(3);

    await expect(countUnreadNotifications(user(9))).resolves.toBe(3);
    expect(repositories.countUnreadByRecipient).toHaveBeenCalledWith(database.db, 9);
  });

  it("marks one notification read only when the row belongs to the user", async () => {
    repositories.markReadForRecipient.mockResolvedValue(0);
    await expect(markNotificationRead(user(9), 12)).resolves.toBe(false);

    repositories.markReadForRecipient.mockResolvedValue(1);
    await expect(markNotificationRead(user(9), 12)).resolves.toBe(true);

    expect(repositories.markReadForRecipient).toHaveBeenCalledWith(database.db, 9, 12);
  });

  it("marks every unread notification read and returns the count", async () => {
    repositories.markReadForRecipient.mockResolvedValue(2);

    await expect(markAllNotificationsRead(user(9))).resolves.toBe(2);
    expect(repositories.markReadForRecipient).toHaveBeenCalledWith(database.db, 9);
  });
});
