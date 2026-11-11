import Link from "next/link";
import { Bell, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import { signOutAction } from "../actions/auth.actions";
import type { NavigationGroup } from "../types/navigation.type";
import type { AppUser } from "../types/user.type";
import { roleLabels } from "../types/role.type";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

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
    <div className="min-h-screen md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r p-4 md:flex md:flex-col md:gap-6">
        <Link href="/dashboard" className="px-2 text-lg font-semibold">
          RCWheels
        </Link>
        <NavLinks groups={navigation} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex min-h-16 items-center gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav groups={navigation} />
            <Link href="/dashboard" className="font-semibold">
              RCWheels
            </Link>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium">{user.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabels[user.role]}</p>
            </div>
            {unreadCount > 0 && (
              <Link
                href="/notifications"
                aria-label={`${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`}
                className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"
              >
                <Bell aria-hidden="true" className="size-4" />
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
                  {unreadCount}
                </span>
              </Link>
            )}
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm" aria-label="Sign out">
                <LogOut aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
