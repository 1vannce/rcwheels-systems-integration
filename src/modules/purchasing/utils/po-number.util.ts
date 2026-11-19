/** Formats a purchase order number for display. */
export function formatPoNumber(purchaseOrderId: number): string {
  return `PO-${String(purchaseOrderId).padStart(4, "0")}`;
}
