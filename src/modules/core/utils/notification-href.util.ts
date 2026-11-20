import type { AppNotification } from "../types/notification.type";

/**
 * Resolves the destination URL for an application notification so users can
 * click to inspect the underlying requisition, inventory adjustment, or order.
 */
export function getNotificationHref(
  notification: Pick<AppNotification, "requisitionId" | "notificationType" | "message">,
): string | null {
  // 1. Direct requisition ID link if recorded on the notification
  if (notification.requisitionId) {
    return `/requisitions/${notification.requisitionId}`;
  }

  // 2. Fallback: message contains an RF or Request number (e.g. "RF #40", "Request #35")
  const reqMatch = notification.message.match(/(?:RF|Request)\s*#(\d+)/i);
  if (reqMatch) {
    return `/requisitions/${reqMatch[1]}`;
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
