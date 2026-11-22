import type { AppNotification } from "../types/notification.type";

type NotificationLike = Pick<AppNotification, "requisitionId" | "notificationType" | "message">;

type NotificationKind =
  | "shortage"
  | "count"
  | "purchase_requisition"
  | "purchase_order"
  | "requisition"
  | "low_stock"
  | "other";

const SHORTAGE_TYPES = new Set(["requisition.stock_shortage", "requisition_awaiting_stock"]);

const REQUISITION_REF = /(?<!Purchase\s+)(?:RF|Request)\s*#(\d+)/i;

/**
 * Decides what a notification is about. The label, the tab and the link all
 * come from this one answer so they cannot disagree.
 *
 * Order: the notification type first, then the recorded requisition id, and
 * message text only for old or generic rows with no useful type. Message text
 * can hold free text (for example the approver's note), so it never overrides
 * a known type or a recorded requisition id.
 */
function classifyNotification(notification: NotificationLike): NotificationKind {
  const type = notification.notificationType ?? "";
  const text = notification.message ?? "";
  const msg = text.toLowerCase();

  if (SHORTAGE_TYPES.has(type)) return "shortage";
  if (type.startsWith("inventory.adjustment") || type.startsWith("adjustment")) return "count";
  if (type.startsWith("purchase_requisition")) return "purchase_requisition";
  if (type.startsWith("purchase_order")) return "purchase_order";

  if (notification.requisitionId) return "requisition";
  if (type.startsWith("requisition")) return "requisition";
  if (type.startsWith("stock")) return "low_stock";

  // Message fallback, only when the type says nothing.
  if (!type || type === "system.info") {
    if (msg.includes("purchase request") || msg.includes("purchase requisition") || msg.includes("pr #")) {
      return "purchase_requisition";
    }
    if (msg.includes("purchase order") || msg.includes("po #")) return "purchase_order";
    if (
      msg.includes("out-of-stock") ||
      msg.includes("awaiting stock") ||
      msg.includes("no stock available") ||
      msg.includes("restock needed")
    ) {
      return "shortage";
    }
    if (msg.includes("stock count") || msg.includes("adjustment")) return "count";
    if (REQUISITION_REF.test(text)) return "requisition";
    if (msg.includes("low stock")) return "low_stock";
  }

  return "other";
}

/** True if the notification is a stock shortage or awaiting stock alert. */
export function isStockShortageNotification(
  notification: Pick<AppNotification, "notificationType" | "message"> & { requisitionId?: number | null },
): boolean {
  return classifyNotification({ requisitionId: null, ...notification }) === "shortage";
}

/** True if the notification is a stock count or adjustment approval. */
export function isCountApprovalNotification(
  notification: Pick<AppNotification, "notificationType" | "message"> & { requisitionId?: number | null },
): boolean {
  return classifyNotification({ requisitionId: null, ...notification }) === "count";
}

/** Returns the primary action button label for a notification. */
export function getNotificationActionLabel(notification: NotificationLike): string {
  switch (classifyNotification(notification)) {
    case "shortage":
      return "View Shortage";
    case "count":
      return "Review Count";
    case "purchase_requisition":
      return "View PR";
    case "purchase_order":
      return "View PO";
    case "requisition":
      return "View Request";
    default:
      return "View";
  }
}

/**
 * Resolves the destination URL for a notification so users can click through
 * to the requisition, inventory adjustment, or order.
 */
export function getNotificationHref(notification: NotificationLike): string | null {
  const type = notification.notificationType ?? "";
  const msg = notification.message ?? "";

  switch (classifyNotification(notification)) {
    case "purchase_requisition":
      return "/purchasing/requisitions";

    case "purchase_order": {
      const poMatch = msg.match(/Purchase order\s*#(\d+)/i) ?? msg.match(/PO\s*#(\d+)/i);
      if (type === "purchase_order_pending_approval") {
        return poMatch ? `/purchasing/accounting-review/${poMatch[1]}` : "/purchasing/accounting-review";
      }
      return poMatch ? `/purchasing/orders/${poMatch[1]}` : "/purchasing/orders";
    }

    case "count":
      return "/inventory/adjustments";

    case "shortage":
    case "requisition": {
      if (notification.requisitionId) {
        return `/requisitions/${notification.requisitionId}?from=notifications`;
      }
      const reqMatch = msg.match(REQUISITION_REF);
      return reqMatch ? `/requisitions/${reqMatch[1]}?from=notifications` : null;
    }

    case "low_stock":
      return "/inventory/items";

    default:
      return null;
  }
}
