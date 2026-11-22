"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRightIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions/notification.actions";
import type { AppNotification } from "../types/notification.type";
import {
  getNotificationActionLabel,
  getNotificationHref,
  isCountApprovalNotification,
  isStockShortageNotification,
} from "../utils/notification-href.util";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

type NotificationTab = "all" | "shortages" | "count_approvals";

export function NotificationList({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const [tab, setTab] = useState<NotificationTab>("all");

  if (notifications.length === 0) {
    return (
      <EmptyState
        title="You have no notifications"
        description="When a request you're involved in changes, or work arrives in your queue, it shows up here."
      />
    );
  }

  const hasUnread = notifications.some((notification) => !notification.readAt);

  const shortageCount = notifications.filter(isStockShortageNotification).length;
  const countApprovalCount = notifications.filter(isCountApprovalNotification).length;

  const displayedNotifications =
    tab === "shortages"
      ? notifications.filter(isStockShortageNotification)
      : tab === "count_approvals"
        ? notifications.filter(isCountApprovalNotification)
        : notifications;

  return (
    <div className="flex flex-col gap-4">
      {/* Mark all as read */}
      {hasUnread && (
        <div>
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">
              Mark all as read
            </Button>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={tab === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("all")}
          className="h-8 px-3 text-xs font-medium"
        >
          All
        </Button>

        <Button
          type="button"
          variant={tab === "shortages" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("shortages")}
          className="h-8 px-3 text-xs font-medium"
        >
          Stock Shortages ({shortageCount})
        </Button>

        <Button
          type="button"
          variant={tab === "count_approvals" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("count_approvals")}
          className="h-8 px-3 text-xs font-medium"
        >
          Count Approvals ({countApprovalCount})
        </Button>
      </div>

      {/* Notifications list */}
      {displayedNotifications.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {tab === "shortages"
            ? "No stock shortage notifications."
            : tab === "count_approvals"
              ? "No count approval notifications."
              : "No notifications found."}
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {displayedNotifications.map((notification) => {
            const isUnread = !notification.readAt;
            const href = getNotificationHref(notification);
            const actionLabel = getNotificationActionLabel(notification);

            return (
              <li
                key={notification.notificationId}
                className={`flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 transition-colors hover:bg-muted/40 ${
                  isUnread ? "shadow-[inset_3px_0_0_var(--primary)] bg-primary/[0.02]" : ""
                }`}
              >
                <div className="flex flex-1 flex-col gap-1 pl-1 min-w-0">
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

                {/* Action buttons: Dismiss (grey) + Primary action (black) */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <form action={markNotificationReadAction} className="shrink-0">
                    <input
                      type="hidden"
                      name="notificationId"
                      value={notification.notificationId}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={!isUnread}
                      className="h-8 px-3 text-xs bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    >
                      Mark as read
                    </Button>
                  </form>

                  {href && (
                    <Link
                      href={href}
                      className={buttonVariants({ variant: "default", size: "sm" })}
                    >
                      {actionLabel}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
