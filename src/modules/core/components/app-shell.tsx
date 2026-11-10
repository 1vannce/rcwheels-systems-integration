import Link from "next/link";

import { Button } from "@/components/ui/button";

import { signOutAction } from "../actions/auth.actions";
import type { NavigationGroup } from "../types/navigation.type";
import type { AppUser } from "../types/user.type";
import { NavLinks } from "./nav-links";
import { roleLabels } from "../types/role.type";

export function AppShell({
  user,
  navigation,
  unreadCount,
  children,
}: {
  user: AppUser;
  navigation: NavigationGroup[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-6 border-b p-4 md:w-64 md:border-r md:border-b-0">
        <Link href="/dashboard" className="px-2 text-lg font-semibold">
          RCWheels
        </Link>
        <NavLinks groups={navigation} />
        <div className="mt-auto flex flex-col gap-2 border-t px-2 pt-4 text-sm">
          <p className="font-medium">{user.fullName}</p>
          <p className="text-muted-foreground">{roleLabels[user.role]}</p>
          {unreadCount > 0 && (
            <Link href="/notifications" className="underline underline-offset-4">
              {unreadCount} unread {unreadCount === 1 ? "notification" : "notifications"}
            </Link>
          )}
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-6">{children}</main>
    </div>
  );
}
