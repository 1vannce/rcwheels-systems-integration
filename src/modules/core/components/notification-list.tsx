import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions/notification.actions";
import type { AppNotification } from "../types/notification.type";
import { getNotificationHref } from "../utils/notification-href.util";

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
          const href = getNotificationHref(notification);

          return (
            <li
              key={notification.notificationId}
              className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 transition-colors hover:bg-muted/40 ${
                isUnread ? "shadow-[inset_3px_0_0_var(--primary)] bg-primary/[0.02]" : ""
              }`}
            >
              <div className="flex flex-1 flex-col gap-0.5 pl-1 min-w-0">
                {href ? (
                  <Link
                    href={href}
                    className="group inline-flex items-start gap-1.5 focus-visible:outline-none focus-visible:underline rounded-sm"
                  >
                    <span
                      className={`text-sm underline-offset-4 group-hover:underline ${
                        isUnread
                          ? "font-medium text-foreground group-hover:text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {notification.message}
                    </span>
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </Link>
                ) : (
                  <p
                    className={
                      isUnread
                        ? "text-sm font-medium text-foreground"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {isUnread && <span className="sr-only">Unread: </span>}
                    {notification.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {dateFormat.format(notification.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {href && (
                  <Link
                    href={href}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    View
                  </Link>
                )}
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
