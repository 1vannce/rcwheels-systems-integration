"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import wordmarkLight from "@/assets/ubecmags-wordmark-light.png";
import { BrandMark } from "@/components/brand-mark";

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
import { brand } from "@/lib/brand";
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
              tooltip={brand.name}
              className="h-auto py-2 group-data-[collapsible=icon]:py-0"
              render={<Link href="/dashboard" />}
            >
              <BrandMark className="hidden group-data-[collapsible=icon]:block" />
              <div className="flex flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
                <Image
                  src={wordmarkLight}
                  alt={brand.name}
                  priority
                  className="h-8 w-auto"
                />
                <span className="text-xs text-sidebar-foreground/60">{brand.tagline}</span>
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
