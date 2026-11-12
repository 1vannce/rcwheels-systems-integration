"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheckIcon,
  BellIcon,
  Building2Icon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleDotIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  FilePlusIcon,
  FileTextIcon,
  FileWarningIcon,
  HistoryIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PackageCheckIcon,
  PackageIcon,
  ReceiptIcon,
  RouteIcon,
  ScanLineIcon,
  SignatureIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  TruckIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";

import { findActiveNavigationItem } from "@/components/navigation";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AppScreen, NavigationGroup } from "@/modules/core";

const screenIcons: Partial<Record<AppScreen, LucideIcon>> = {
  dashboard: LayoutDashboardIcon,
  notifications: BellIcon,
  "request-timeline": HistoryIcon,
  "requisition-new-rf": FilePlusIcon,
  "requisition-my-requests": ClipboardListIcon,
  "requisition-approval-queue": CheckCheckIcon,
  "inventory-item-list": PackageIcon,
  "inventory-issue-queue": ListChecksIcon,
  "inventory-ar-preparation": ClipboardCheckIcon,
  "inventory-dispatch": TruckIcon,
  "inventory-adjustments": SlidersHorizontalIcon,
  "inventory-sales-deductions": ReceiptIcon,
  "inventory-low-stock-review": TriangleAlertIcon,
  "purchasing-supplier-list": Building2Icon,
  "purchasing-pr-queue": InboxIcon,
  "purchasing-po-editor": FileTextIcon,
  "purchasing-accounting-review": BadgeCheckIcon,
  "purchasing-open-po-follow-up": ClockIcon,
  "delivery-receiving-queue": PackageCheckIcon,
  "delivery-receipt-inspection": ScanLineIcon,
  "delivery-sdr": CircleAlertIcon,
  "delivery-internal-delivery-queue": RouteIcon,
  "delivery-acceptance-and-ar-signing": SignatureIcon,
  "delivery-rdr": FileWarningIcon,
  "delivery-return-inspection": Undo2Icon,
};

export function NavMain({ groups }: { groups: NavigationGroup[] }) {
  const pathname = usePathname();
  const activeItem = findActiveNavigationItem(groups, pathname);

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const isCurrent = activeItem?.screen === item.screen;
              const Icon = screenIcons[item.screen] ?? CircleDotIcon;

              return (
                <SidebarMenuItem key={item.screen}>
                  <SidebarMenuButton
                    isActive={isCurrent}
                    tooltip={item.label}
                    render={
                      <Link
                        href={item.href}
                        aria-current={isCurrent ? "page" : undefined}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {!item.isBuilt && (
                    <SidebarMenuBadge className="text-muted-foreground group-data-[collapsible=icon]:hidden">
                      Later
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
