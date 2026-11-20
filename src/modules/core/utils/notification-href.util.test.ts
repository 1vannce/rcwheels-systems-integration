import { describe, expect, it } from "vitest";
import { getNotificationHref } from "./notification-href.util";

describe("getNotificationHref", () => {
  it("routes to the requisition page when requisitionId is provided", () => {
    expect(
      getNotificationHref({
        requisitionId: 40,
        notificationType: "requisition.stock_shortage",
        message: "RF #40 approved with 1 out-of-stock item(s).",
      }),
    ).toBe("/requisitions/40");
  });

  it("extracts RF or Request number from message when requisitionId is null", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "requisition_awaiting_stock",
        message: "Request #35 has no stock available and is awaiting stock.",
      }),
    ).toBe("/requisitions/35");

    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "requisition.approved",
        message: "RF #12 is approved.",
      }),
    ).toBe("/requisitions/12");
  });

  it("routes stock count and adjustment notifications to adjustments page", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "adjustment.requested",
        message: "Liza Cabrera recorded a stock count that needs your approval.",
      }),
    ).toBe("/inventory/adjustments");
  });

  it("routes purchase order notifications to the appropriate purchasing page", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "purchase_order_pending_approval",
        message: "Purchase order #7 needs Accounting review.",
      }),
    ).toBe("/purchasing/accounting-review/7");

    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "purchase_order_approved",
        message: "Purchase order #8 was approved.",
      }),
    ).toBe("/purchasing/orders/8");
  });

  it("routes purchase requisition notifications to purchasing PRs", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "purchase_requisition_created",
        message: "PR #3 created for shortage.",
      }),
    ).toBe("/purchasing/requisitions");
  });

  it("routes low stock notifications to inventory items", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "stock.low",
        message: "Item TIRE-101 has hit its reorder point.",
      }),
    ).toBe("/inventory/items");
  });

  it("returns null for generic notifications without matching pattern", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "system.info",
        message: "System maintenance tonight at 11 PM.",
      }),
    ).toBeNull();
  });
});
