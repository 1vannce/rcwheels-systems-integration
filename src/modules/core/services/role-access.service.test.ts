import { describe, expect, it } from "vitest";

import { appRoles, appScreens } from "../types/role.type";
import { getVisibleScreensForRole, roleCanAccessScreen } from "./role-access.service";

describe("role access service", () => {
  it("returns screens for every known role", () => {
    for (const role of appRoles) {
      expect(getVisibleScreensForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("restricts requesters from inventory screens", () => {
    expect(roleCanAccessScreen("requester", "inventory-item-list")).toBe(false);
    expect(roleCanAccessScreen("requester", "requisition-new-rf")).toBe(true);
  });

  it("keeps accounting focused on accounting review", () => {
    expect(roleCanAccessScreen("accounting_associate", "purchasing-accounting-review")).toBe(
      true,
    );
    expect(roleCanAccessScreen("accounting_associate", "purchasing-po-editor")).toBe(false);
  });

  it("gives system administrator all screens", () => {
    const adminScreens = getVisibleScreensForRole("system_administrator");

    expect(adminScreens).toHaveLength(appScreens.length);

    for (const screen of appScreens) {
      expect(roleCanAccessScreen("system_administrator", screen)).toBe(true);
    }
  });
});
