"use client";

import * as React from "react";
import Link from "next/link";
import { CircleDotIcon } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { NavigationGroup } from "@/modules/core";

export function AppSidebar({
  user,
  roleLabel,
  navigation,
  unreadCount,
  ...props
}: {
  user: { fullName: string; email: string };
  roleLabel: string;
  navigation: NavigationGroup[];
  unreadCount: number;
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="RCWheels"
              render={<Link href="/dashboard" />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <CircleDotIcon className="size-4" aria-hidden="true" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">RCWheels</span>
                <span className="truncate text-xs">Business management</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navigation} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          name={user.fullName}
          email={user.email}
          roleLabel={roleLabel}
          unreadCount={unreadCount}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
