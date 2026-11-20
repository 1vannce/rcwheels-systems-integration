import type { AppNotification } from "../types/notification.type";

/**
 * Returns true if the notification is related to a stock shortage / awaiting stock.
 */
export function isStockShortageNotification(
  notification: Pick<AppNotification, "notificationType" | "message">,
): boolean {
  if (
    notification.notificationType === "requisition.stock_shortage" ||
    notification.notificationType === "requisition_awaiting_stock"
  ) {
    return true;
  }
  const msg = notification.message.toLowerCase();
  return (
    msg.includes("out-of-stock") ||
    msg.includes("awaiting stock") ||
    msg.includes("no stock available") ||
    msg.includes("restock needed") ||
    msg.includes("shortage")
  );
}

/**
 * Returns true if the notification is related to a stock count / adjustment approval.
 */
export function isCountApprovalNotification(
  notification: Pick<AppNotification, "notificationType" | "message">,
): boolean {
  if (notification.notificationType.startsWith("adjustment")) {
    return true;
  }
  const msg = notification.message.toLowerCase();
  return msg.includes("stock count") || msg.includes("adjustment");
}

/**
 * Returns the primary action button label for the notification.
 */
export function getNotificationActionLabel(
  notification: Pick<AppNotification, "requisitionId" | "notificationType" | "message">,
): string {
  if (isStockShortageNotification(notification)) {
    return "View Shortage";
  }
  if (isCountApprovalNotification(notification)) {
    return "Review Count";
  }
  if (notification.requisitionId || /(?:RF|Request)\s*#\d+/i.test(notification.message)) {
    return "View Request";
  }
  return "View";
}

/**
 * Resolves the destination URL for an application notification so users can
 * click to inspect the underlying requisition, inventory adjustment, or order.
 */
export function getNotificationHref(
  notification: Pick<AppNotification, "requisitionId" | "notificationType" | "message">,
): string | null {
  // 1. Direct requisition ID link if recorded on the notification
  if (notification.requisitionId) {
    return `/requisitions/${notification.requisitionId}?from=notifications`;
  }

  // 2. Fallback: message contains an RF or Request number (e.g. "RF #40", "Request #35")
  const reqMatch = notification.message.match(/(?:RF|Request)\s*#(\d+)/i);
  if (reqMatch) {
    return `/requisitions/${reqMatch[1]}?from=notifications`;
  }

  // 3. Stock adjustments
  if (
    notification.notificationType.startsWith("adjustment") ||
    notification.message.toLowerCase().includes("stock count") ||
    notification.message.toLowerCase().includes("adjustment")
  ) {
    return "/inventory/adjustments";
  }

  // 4. Purchase orders
  if (
    notification.notificationType.startsWith("purchase_order") ||
    notification.message.toLowerCase().includes("purchase order") ||
    notification.message.includes("PO #")
  ) {
    const poMatch =
      notification.message.match(/Purchase order\s*#(\d+)/i) ??
      notification.message.match(/PO\s*#(\d+)/i);

    if (notification.notificationType === "purchase_order_pending_approval") {
      return poMatch ? `/purchasing/accounting-review/${poMatch[1]}` : "/purchasing/accounting-review";
    }
    return poMatch ? `/purchasing/orders/${poMatch[1]}` : "/purchasing/orders";
  }

  // 5. Purchase requisitions
  if (
    notification.notificationType.startsWith("purchase_requisition") ||
    notification.message.toLowerCase().includes("purchase request") ||
    notification.message.includes("PR #")
  ) {
    return "/purchasing/requisitions";
  }

  // 6. Low stock review
  if (
    notification.notificationType.startsWith("stock") ||
    notification.message.toLowerCase().includes("low stock")
  ) {
    return "/inventory/items";
  }

  return null;
}
