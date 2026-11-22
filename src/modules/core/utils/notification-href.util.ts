import type { AppNotification } from "../types/notification.type";

/**
 * Returns true if the notification is specifically a stock shortage / awaiting stock alert.
 * Classified primarily by notificationType to prevent overlap with purchasing notifications.
 */
export function isStockShortageNotification(
  notification: Pick<AppNotification, "notificationType" | "message">,
): boolean {
  if (
    notification.notificationType === "requisition.stock_shortage" ||
    notification.notificationType === "requisition_awaiting_stock" ||
    notification.notificationType === "requisition.awaiting_stock"
  ) {
    return true;
  }
  // Safe fallback only if notificationType is generic or missing
  if (!notification.notificationType || notification.notificationType === "system.info") {
    const msg = notification.message.toLowerCase();
    const isPr = msg.includes("purchase request") || msg.includes("purchase requisition");
    return (
      !isPr &&
      (msg.includes("out-of-stock") ||
        msg.includes("awaiting stock") ||
        msg.includes("restock needed"))
    );
  }
  return false;
}

/**
 * Returns true if the notification is related to a stock count / adjustment approval.
 * Classified primarily by notificationType.
 */
export function isCountApprovalNotification(
  notification: Pick<AppNotification, "notificationType" | "message">,
): boolean {
  if (
    notification.notificationType.startsWith("inventory.adjustment") ||
    notification.notificationType.startsWith("adjustment")
  ) {
    return true;
  }
  if (!notification.notificationType || notification.notificationType === "system.info") {
    const msg = notification.message.toLowerCase();
    return msg.includes("stock count") || msg.includes("adjustment");
  }
  return false;
}

/**
 * Returns the primary action button label derived cleanly from notificationType and context.
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
  if (
    notification.notificationType?.startsWith("purchase_requisition") ||
    notification.message.toLowerCase().includes("purchase request")
  ) {
    return "View PR";
  }
  if (
    notification.notificationType?.startsWith("purchase_order") ||
    notification.message.toLowerCase().includes("purchase order")
  ) {
    return "View PO";
  }
  if (notification.requisitionId || /(?<!Purchase\s+)(?:RF|Request)\s*#\d+/i.test(notification.message)) {
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
  const type = notification.notificationType ?? "";
  const msg = notification.message ?? "";

  // 1. Purchase requisitions (check type and explicit PR phrases first so they don't get misrouted as RFs)
  if (
    type.startsWith("purchase_requisition") ||
    msg.toLowerCase().includes("purchase request") ||
    msg.includes("PR #")
  ) {
    return "/purchasing/requisitions";
  }

  // 2. Purchase orders
  if (
    type.startsWith("purchase_order") ||
    msg.toLowerCase().includes("purchase order") ||
    msg.includes("PO #")
  ) {
    const poMatch =
      msg.match(/Purchase order\s*#(\d+)/i) ??
      msg.match(/PO\s*#(\d+)/i);

    if (type === "purchase_order_pending_approval") {
      return poMatch ? `/purchasing/accounting-review/${poMatch[1]}` : "/purchasing/accounting-review";
    }
    return poMatch ? `/purchasing/orders/${poMatch[1]}` : "/purchasing/orders";
  }

  // 3. Stock count adjustments
  if (
    type.startsWith("inventory.adjustment") ||
    type.startsWith("adjustment") ||
    msg.toLowerCase().includes("stock count") ||
    msg.toLowerCase().includes("adjustment")
  ) {
    return "/inventory/adjustments";
  }

  // 4. Requisitions: Direct ID if recorded on the notification
  if (notification.requisitionId) {
    return `/requisitions/${notification.requisitionId}?from=notifications`;
  }

  // 5. Requisitions fallback: message contains "RF #X" or "Request #X" (not "Purchase request #X")
  const reqMatch = msg.match(/(?<!Purchase\s+)(?:RF|Request)\s*#(\d+)/i);
  if (reqMatch) {
    return `/requisitions/${reqMatch[1]}?from=notifications`;
  }

  // 6. Low stock review
  if (
    type.startsWith("stock") ||
    msg.toLowerCase().includes("low stock")
  ) {
    return "/inventory/items";
  }

  return null;
}
