import "server-only";

import { db, type Tx } from "@/db";

import {
  countUnreadByRecipient,
  findNotificationsByRecipient,
  insertNotifications,
  markReadForRecipient,
} from "../repositories/notification.repository";
import { findActiveUserIdsByRoles } from "../repositories/user.repository";
import type { AppNotification } from "../types/notification.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";

const NOTIFICATION_LIST_LIMIT = 100;

type NotificationContent = {
  type: string;
  message: string;
  requisitionId?: number;
};

/** Sends one in-system notification to each user, inside the caller's transaction. */
export async function notifyUsers(
  tx: Tx,
  recipientUserIds: readonly number[],
  content: NotificationContent,
): Promise<void> {
  const recipients = [...new Set(recipientUserIds)];

  await insertNotifications(
    tx,
    recipients.map((recipientUserId) => ({
      recipientUserId,
      requisitionId: content.requisitionId ?? null,
      notificationType: content.type,
      message: content.message,
    })),
  );
}

/**
 * Notifies every active user holding one of the roles. `exceptUserId` leaves
 * out the person who caused the event.
 */
export async function notifyRoles(
  tx: Tx,
  roles: readonly AppRole[],
  content: NotificationContent,
  exceptUserId?: number,
): Promise<void> {
  const userIds = await findActiveUserIdsByRoles(tx, roles);

  await notifyUsers(
    tx,
    userIds.filter((userId) => userId !== exceptUserId),
    content,
  );
}

export async function listNotifications(user: AppUser): Promise<AppNotification[]> {
  return findNotificationsByRecipient(db, user.userId, NOTIFICATION_LIST_LIMIT);
}

export async function countUnreadNotifications(user: AppUser): Promise<number> {
  return countUnreadByRecipient(db, user.userId);
}

/** Marks one of the user's own notifications as read. Others' are left alone. */
export async function markNotificationRead(
  user: AppUser,
  notificationId: number,
): Promise<boolean> {
  return (await markReadForRecipient(db, user.userId, notificationId)) > 0;
}

export async function markAllNotificationsRead(user: AppUser): Promise<number> {
  return markReadForRecipient(db, user.userId);
}
