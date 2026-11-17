import type { Metadata } from "next";
import Link from "next/link";

import PageHeader from "@/components/page-header";
import {
  countUnreadNotifications,
  getNavigationForRole,
  requireScreen,
} from "@/modules/core";

export const metadata: Metadata = { title: "Dashboard" };

// The dashboard reads the signed-in user at request time, so navigating here
// waits for that data instead of showing an instant shell.
export const instant = false;

export default async function DashboardPage() {
  const user = await requireScreen("dashboard");
  const unreadCount = await countUnreadNotifications(user);
  const groups = getNavigationForRole(user.role).filter(
    (group) => group.title !== "Shared",
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName}`}
        description={
          unreadCount === 0 ? (
            "You have no unread notifications. Pick a screen below to start work."
          ) : (
            <Link
              href="/notifications"
              className="font-medium text-primary underline underline-offset-4"
            >
              You have {unreadCount} unread{" "}
              {unreadCount === 1 ? "notification" : "notifications"}.
            </Link>
          )
        }
      />
      <div className="grid items-start gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-1">
            <h2 className="border-b-2 border-foreground/80 pb-1.5 text-lg font-semibold">
              {group.title}
            </h2>
            <ul className="flex flex-col divide-y">
              {group.items.map((item) => (
                <li key={item.screen}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-sm px-1 py-2.5 text-sm font-medium hover:bg-muted hover:text-primary"
                  >
                    {item.label}
                    {!item.isBuilt && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Later phase
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
