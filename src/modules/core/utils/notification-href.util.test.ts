import { describe, expect, it } from "vitest";
import {
  getNotificationActionLabel,
  getNotificationHref,
  isCountApprovalNotification,
  isStockShortageNotification,
} from "./notification-href.util";

describe("getNotificationHref", () => {
  it("routes to the requisition page when requisitionId is provided", () => {
    expect(
      getNotificationHref({
        requisitionId: 40,
        notificationType: "requisition.stock_shortage",
        message: "RF #40 approved with 1 out-of-stock item(s).",
      }),
    ).toBe("/requisitions/40?from=notifications");
  });

  it("extracts RF or Request number from message when requisitionId is null", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "requisition_awaiting_stock",
        message: "Request #35 has no stock available and is awaiting stock.",
      }),
    ).toBe("/requisitions/35?from=notifications");

    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "requisition.approved",
        message: "RF #12 is approved.",
      }),
    ).toBe("/requisitions/12?from=notifications");
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

    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "purchase_order_ready_to_receive",
        message: "Purchase order #9 was placed. Inspect and record the delivery when it arrives.",
      }),
    ).toBe("/delivery/receiving/9");
  });

  it("routes purchase requisition notifications to purchasing PRs and does not misroute as a requisition", () => {
    expect(
      getNotificationHref({
        requisitionId: null,
        notificationType: "purchase_requisition_created",
        message: "Purchase request #5 was raised for request #40.",
      }),
    ).toBe("/purchasing/requisitions");

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

describe("isStockShortageNotification", () => {
  it("identifies shortage notification types and messages", () => {
    expect(
      isStockShortageNotification({
        notificationType: "requisition.stock_shortage",
        message: "RF #40 approved with 1 out-of-stock item(s). Restock needed.",
      }),
    ).toBe(true);

    expect(
      isStockShortageNotification({
        notificationType: "requisition_awaiting_stock",
        message: "Request #35 has no stock available and is awaiting stock.",
      }),
    ).toBe(true);

    expect(
      isStockShortageNotification({
        notificationType: "requisition.approved",
        message: "Request #34 is fully reserved and ready for delivery.",
      }),
    ).toBe(false);

    expect(
      isStockShortageNotification({
        notificationType: "purchase_requisition_created",
        message: "Purchase request PR #5 was raised for shortage on request #40.",
      }),
    ).toBe(false);
  });
});

describe("isCountApprovalNotification", () => {
  it("identifies count adjustment notifications", () => {
    expect(
      isCountApprovalNotification({
        notificationType: "adjustment.requested",
        message: "Liza Cabrera recorded a stock count that needs your approval.",
      }),
    ).toBe(true);

    expect(
      isCountApprovalNotification({
        notificationType: "requisition.approved",
        message: "Request #34 is fully reserved and ready for delivery.",
      }),
    ).toBe(false);
  });
});

describe("getNotificationActionLabel", () => {
  it("returns View Shortage for shortage alerts", () => {
    expect(
      getNotificationActionLabel({
        requisitionId: 40,
        notificationType: "requisition.stock_shortage",
        message: "RF #40 approved with 1 out-of-stock item(s).",
      }),
    ).toBe("View Shortage");
  });

  it("returns Review Count for stock count approvals", () => {
    expect(
      getNotificationActionLabel({
        requisitionId: null,
        notificationType: "adjustment.requested",
        message: "Liza Cabrera recorded a stock count that needs your approval.",
      }),
    ).toBe("Review Count");
  });

  it("returns View Request for other requisitions", () => {
    expect(
      getNotificationActionLabel({
        requisitionId: 34,
        notificationType: "requisition.reserved",
        message: "Request #34 is fully reserved.",
      }),
    ).toBe("View Request");
  });
});

describe("notification classification order", () => {
  it("keeps the requisition link when the approver note contains routing words", () => {
    const shortage = {
      requisitionId: 40,
      notificationType: "requisition.stock_shortage",
      message:
        'RF #40 approved with 1 out-of-stock item(s). Restock needed. Note from approver: "need adjustment, see purchase request PO #9".',
    };
    expect(getNotificationHref(shortage)).toBe("/requisitions/40?from=notifications");
    expect(getNotificationActionLabel(shortage)).toBe("View Shortage");
    expect(isStockShortageNotification(shortage)).toBe(true);
    expect(isCountApprovalNotification(shortage)).toBe(false);
  });

  it("keeps the requisition link for an RF type that mentions a purchase order", () => {
    expect(
      getNotificationHref({
        requisitionId: 12,
        notificationType: "requisition.approved",
        message: "RF #12 is approved. Waiting on purchase order PO #3.",
      }),
    ).toBe("/requisitions/12?from=notifications");
  });

  it("does not throw and falls back to the message when the type is missing", () => {
    const untyped = {
      requisitionId: null,
      notificationType: undefined as unknown as string,
      message: "PR #5 was raised.",
    };
    expect(isCountApprovalNotification(untyped)).toBe(false);
    expect(getNotificationHref(untyped)).toBe("/purchasing/requisitions");
    expect(getNotificationActionLabel(untyped)).toBe("View PR");
  });

  it("classifies old rows by message when the type is generic", () => {
    expect(
      isStockShortageNotification({
        notificationType: "system.info",
        message: "Request #35 has no stock available and is awaiting stock.",
      }),
    ).toBe(true);
  });

  it("gives label, tab and link the same answer for purchasing notifications", () => {
    const pr = {
      requisitionId: null,
      notificationType: "purchase_requisition_created",
      message: "PR #3 created for shortage.",
    };
    expect(isStockShortageNotification(pr)).toBe(false);
    expect(getNotificationActionLabel(pr)).toBe("View PR");
    expect(getNotificationHref(pr)).toBe("/purchasing/requisitions");
  });

  it("labels purchase order notifications View PO", () => {
    expect(
      getNotificationActionLabel({
        requisitionId: null,
        notificationType: "purchase_order_approved",
        message: "Purchase order #8 was approved.",
      }),
    ).toBe("View PO");
  });
});
