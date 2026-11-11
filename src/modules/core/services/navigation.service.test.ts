import { describe, expect, it } from "vitest";

import { appRoles } from "../types/role.type";
import { findScreenByPath, getNavigationForRole } from "./navigation.service";
import { roleCanAccessScreen } from "./role-access.service";

describe("navigation service", () => {
  it("shows each role only the screens it may use", () => {
    for (const role of appRoles) {
      const items = getNavigationForRole(role).flatMap((group) => group.items);

      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(roleCanAccessScreen(role, item.screen)).toBe(true);
      }
    }
  });

  it("hides whole modules from roles that have no screen in them", () => {
    const requesterGroups = getNavigationForRole("requester").map(
      (group) => group.title,
    );

    expect(requesterGroups).toEqual(["Shared", "Requisition", "Delivery"]);

    const accountingLinks = getNavigationForRole("accounting_associate")
      .flatMap((group) => group.items)
      .map((item) => item.href);

    expect(accountingLinks).toContain("/purchasing/accounting-review");
    expect(accountingLinks).not.toContain("/purchasing/orders");
    expect(accountingLinks).not.toContain("/inventory/items");
  });

  it("gives every menu link its own path", () => {
    const hrefs = getNavigationForRole("system_administrator")
      .flatMap((group) => group.items)
      .map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("finds a screen by its path", () => {
    expect(findScreenByPath("/purchasing/suppliers")).toEqual({
      screen: "purchasing-supplier-list",
      label: "Suppliers",
    });
    expect(findScreenByPath("/unknown")).toBeNull();
  });

  it("marks the new requester pages as available", () => {
    const requesterLinks = getNavigationForRole("requester").flatMap(
      (group) => group.items,
    );

    expect(
      requesterLinks.find((item) => item.href === "/requisitions/new")?.isBuilt,
    ).toBe(true);
    expect(
      requesterLinks.find((item) => item.href === "/requisitions/my-requests")
        ?.isBuilt,
    ).toBe(true);
  });
});
