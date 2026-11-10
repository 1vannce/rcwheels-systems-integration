import type { RequisitionStatus } from "../types/requisition.dto";

/**
 * Human labels for the database status values. Kept in one place so every
 * screen names a status the same way.
 */
export const requisitionStatusLabels: Record<RequisitionStatus, string> = {
  pending_approval: "Pending approval",
  rejected: "Rejected",
  approved: "Approved",
  awaiting_stock: "Awaiting stock",
  for_delivery: "For delivery",
  out_for_delivery: "Out for delivery",
  pending_resolution: "Pending resolution",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

/**
 * Tone per status. Warning states need attention, informational states are in
 * progress, and danger states are closed without delivery.
 */
const statusTones: Record<RequisitionStatus, string> = {
  pending_approval: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  awaiting_stock: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  pending_resolution: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  for_delivery: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  out_for_delivery: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  fulfilled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** A small label showing one requisition status. */
export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusTones[status]}`}
    >
      {requisitionStatusLabels[status]}
    </span>
  );
}
