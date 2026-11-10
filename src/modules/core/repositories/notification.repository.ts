import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import type { Tx } from "@/db";
import { notifications } from "@/db/schema";

import type { AppNotification } from "../types/notification.type";

export async function insertNotifications(
  tx: Tx,
  rows: {
    recipientUserId: number;
    requisitionId: number | null;
    notificationType: string;
    message: string;
  }[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await tx.insert(notifications).values(rows);
}

export async function findNotificationsByRecipient(
  tx: Tx,
  recipientUserId: number,
  limit: number,
): Promise<AppNotification[]> {
  return tx
    .select({
      notificationId: notifications.notificationId,
      notificationType: notifications.notificationType,
      message: notifications.message,
      requisitionId: notifications.requisitionId,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(eq(notifications.recipientUserId, recipientUserId))
    .orderBy(desc(notifications.createdAt), desc(notifications.notificationId))
    .limit(limit);
}

export async function countUnreadByRecipient(
  tx: Tx,
  recipientUserId: number,
): Promise<number> {
  const [row] = await tx
    .select({ unread: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.readAt),
      ),
    );

  return row.unread;
}

/** Marks one unread notification, or every unread one when no ID is given. */
export async function markReadForRecipient(
  tx: Tx,
  recipientUserId: number,
  notificationId?: number,
): Promise<number> {
  const rows = await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientUserId, recipientUserId),
        isNull(notifications.readAt),
        notificationId === undefined
          ? undefined
          : eq(notifications.notificationId, notificationId),
      ),
    )
    .returning({ notificationId: notifications.notificationId });

  return rows.length;
}
