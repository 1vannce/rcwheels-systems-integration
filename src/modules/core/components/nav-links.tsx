"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import type { NavigationGroup } from "../types/navigation.type";

export function NavLinks({
  groups,
  onNavigate,
}: {
  groups: NavigationGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className="px-2 text-xs font-medium text-muted-foreground uppercase">
            {group.title}
          </p>
          {group.items.map((item) => {
            // A detail page highlights its list, unless it has its own link.
            const isCurrent =
              pathname === item.href ||
              (pathname.startsWith(`${item.href}/`) && !hrefs.includes(pathname));

            return (
              <Link
                key={item.screen}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
                  isCurrent && "bg-muted font-medium",
                )}
              >
                {item.label}
                {!item.isBuilt && (
                  <span className="text-xs text-muted-foreground">Later</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
