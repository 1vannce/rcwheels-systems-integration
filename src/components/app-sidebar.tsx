"use client";

import * as React from "react";
import Link from "next/link";

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
              <div
                aria-hidden="true"
                className="flex aspect-square size-8 items-center justify-center rounded-sm bg-signal text-[0.8rem] font-bold tracking-tight text-[oklch(0.22_0.04_45)] [font-stretch:80%]"
              >
                RC
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[0.95rem] font-semibold [font-stretch:85%]">
                  RCWheels
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Stockroom and requisitions
                </span>
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
