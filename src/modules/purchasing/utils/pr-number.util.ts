/** Formats a purchase requisition number for display. */
export function formatPrNumber(purchaseRequisitionId: number): string {
  return `PR-${String(purchaseRequisitionId).padStart(4, "0")}`;
}
