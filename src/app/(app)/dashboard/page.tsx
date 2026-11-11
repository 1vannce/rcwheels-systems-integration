import type { Metadata } from "next";
import Link from "next/link";

import {
  countUnreadNotifications,
  getNavigationForRole,
  requireScreen,
} from "@/modules/core";

export const metadata: Metadata = { title: "Dashboard | RCWheels" };

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {unreadCount === 0 ? (
            "You have no unread notifications."
          ) : (
            <Link href="/notifications" className="underline underline-offset-4">
              You have {unreadCount} unread{" "}
              {unreadCount === 1 ? "notification" : "notifications"}.
            </Link>
          )}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2 rounded-lg border p-4">
            <h2 className="font-medium">{group.title}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {group.items.map((item) => (
                <li key={item.screen}>
                  <Link href={item.href} className="underline underline-offset-4">
                    {item.label}
                  </Link>
                  {!item.isBuilt && (
                    <span className="text-muted-foreground"> (later phase)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
