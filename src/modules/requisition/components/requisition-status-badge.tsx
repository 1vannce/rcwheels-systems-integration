import type { RequisitionStatus } from "../types/requisition.dto";

/**
 * Human labels for the database status values. Kept in one place so every
 * screen names a status the same way.
 */
export const requisitionStatusLabels: Record<RequisitionStatus, string> = {
  pending_approval: "Pending Approval",
  rejected: "Rejected",
  approved: "Approved",
  awaiting_stock: "Awaiting Stock",
  for_delivery: "For Delivery",
  out_for_delivery: "Out for Delivery",
  pending_resolution: "Pending Resolution",
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
  pending_resolution: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  for_delivery: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  out_for_delivery: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  fulfilled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

const statusDotColors: Record<RequisitionStatus, string> = {
  pending_approval: "bg-amber-500",
  awaiting_stock: "bg-amber-500",
  pending_resolution: "bg-purple-500",
  approved: "bg-emerald-500",
  for_delivery: "bg-sky-500",
  out_for_delivery: "bg-sky-500",
  fulfilled: "bg-emerald-500",
  rejected: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

/** A small label showing one requisition status with a status indicator dot. */
export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusTones[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotColors[status]}`} />
      {requisitionStatusLabels[status]}
    </span>
  );
}
