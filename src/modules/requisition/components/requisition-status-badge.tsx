import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

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
  delivered: "Delivered",
  pending_resolution: "Pending Resolution",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

/**
 * Tone per status. Waiting states need someone to act, active states are
 * moving through the stockroom, and stopped states closed without delivery.
 */
const statusTones: Record<RequisitionStatus, StatusTone> = {
  pending_approval: "waiting",
  awaiting_stock: "waiting",
  pending_resolution: "review",
  approved: "active",
  for_delivery: "active",
  out_for_delivery: "active",
  // Everything accepted or cancelled; the approver still marks it Fulfilled.
  delivered: "waiting",
  fulfilled: "done",
  rejected: "stopped",
  cancelled: "closed",
};

/** A tag showing one requisition status in words and colour. */
export function RequisitionStatusBadge({ status }: { status: RequisitionStatus }) {
  return <StatusBadge tone={statusTones[status]}>{requisitionStatusLabels[status]}</StatusBadge>;
}
