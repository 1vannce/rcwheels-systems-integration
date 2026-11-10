import { Button } from "@/components/ui/button";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions/notification.actions";
import type { AppNotification } from "../types/notification.type";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export function NotificationList({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  if (notifications.length === 0) {
    return <p className="text-sm text-muted-foreground">You have no notifications.</p>;
  }

  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <div className="flex flex-col gap-4">
      {hasUnread && (
        <form action={markAllNotificationsReadAction}>
          <Button type="submit" variant="outline" size="sm">
            Mark all as read
          </Button>
        </form>
      )}
      <ul className="flex flex-col divide-y rounded-lg border">
        {notifications.map((notification) => (
          <li
            key={notification.notificationId}
            className="flex items-start justify-between gap-4 p-3"
          >
            <div className="flex flex-col gap-1">
              <p className={notification.readAt ? "text-sm" : "text-sm font-medium"}>
                {notification.message}
              </p>
              <p className="text-xs text-muted-foreground">
                {dateFormat.format(notification.createdAt)}
              </p>
            </div>
            {!notification.readAt && (
              <form action={markNotificationReadAction}>
                <input
                  type="hidden"
                  name="notificationId"
                  value={notification.notificationId}
                />
                <Button type="submit" variant="ghost" size="sm">
                  Mark as read
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
