import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
    return (
      <EmptyState
        title="You have no notifications"
        description="When a request you're involved in changes, or work arrives in your queue, it shows up here."
      />
    );
  }

  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <form action={markAllNotificationsReadAction}>
          <Button type="submit" variant="outline" size="sm">
            Mark all as read
          </Button>
        </form>
      )}
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {notifications.map((notification) => {
          const isUnread = !notification.readAt;

          return (
            <li
              key={notification.notificationId}
              className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${
                isUnread ? "shadow-[inset_3px_0_0_var(--primary)]" : ""
              }`}
            >
              <div className="flex flex-col gap-0.5 pl-1">
                <p className={isUnread ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {isUnread && <span className="sr-only">Unread: </span>}
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {dateFormat.format(notification.createdAt)}
                </p>
              </div>
              {isUnread && (
                <form action={markNotificationReadAction} className="shrink-0">
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
          );
        })}
      </ul>
    </div>
  );
}
