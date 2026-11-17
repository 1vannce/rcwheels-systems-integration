"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { findActiveNavigationItem } from "@/components/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import type { NavigationGroup } from "../types/navigation.type";
import { roleLabels } from "../types/role.type";
import type { AppUser } from "../types/user.type";

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
  const pathname = usePathname();
  const current = findActiveNavigationItem(navigation, pathname);

  return (
    <SidebarProvider>
      <AppSidebar
        user={user}
        roleLabel={roleLabels[user.role]}
        navigation={navigation}
        unreadCount={unreadCount}
      />
      <SidebarInset className="md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:ring-1 md:peer-data-[variant=inset]:ring-sidebar-border">
        <header className="sticky top-0 z-10 flex md:rounded-t-xl h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink render={<Link href="/dashboard" />}>
                    RCWheels
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {current?.label ?? "Dashboard"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {unreadCount > 0 && (
            <div className="ml-auto flex items-center gap-2 px-4">
              <Link
                href="/notifications"
                aria-label={`${unreadCount} unread ${
                  unreadCount === 1 ? "notification" : "notifications"
                }`}
                className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <BellIcon aria-hidden="true" className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground">
                  {unreadCount}
                </span>
              </Link>
            </div>
          )}
        </header>
        <main className="flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
