import { describe, expect, it } from "vitest";

import type { NavigationGroup } from "@/modules/core";

import { findActiveNavigationItem } from "./navigation";

const groups: NavigationGroup[] = [
  {
    title: "Requisition",
    items: [
      {
        screen: "requisition-new-rf",
        label: "New requisition",
        href: "/requisitions/new",
        isBuilt: true,
      },
      {
        screen: "requisition-my-requests",
        label: "My requests",
        href: "/requisitions/my-requests",
        activePathPrefixes: ["/requisitions/"],
        isBuilt: true,
      },
      {
        screen: "requisition-approval-queue",
        label: "Approval queue",
        href: "/requisitions/approvals",
        isBuilt: true,
      },
    ],
  },
];

describe("findActiveNavigationItem", () => {
  it("prefers an exact menu link", () => {
    expect(
      findActiveNavigationItem(groups, "/requisitions/approvals")?.label,
    ).toBe("Approval queue");
    expect(findActiveNavigationItem(groups, "/requisitions/new")?.label).toBe(
      "New requisition",
    );
  });

  it("falls back to a screen's list for its detail pages", () => {
    expect(findActiveNavigationItem(groups, "/requisitions/42")?.label).toBe(
      "My requests",
    );
    expect(
      findActiveNavigationItem(groups, "/inventory/items/7"),
    ).toBeUndefined();
  });

  it("returns nothing for a path outside the menu", () => {
    expect(findActiveNavigationItem(groups, "/login")).toBeUndefined();
  });
});
