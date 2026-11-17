import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";

import { UrgentBadge } from "@/components/ui/status-badge";

import type { RequisitionListItemDto } from "../types/requisition.dto";
import { RequisitionStatusBadge } from "./requisition-status-badge";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});
const deliveryDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/**
 * The signed-in user's request list. Each row links to the detail screen; the
 * list itself carries only overview figures.
 */
export function RequisitionTable({
  requisitions,
}: {
  requisitions: RequisitionListItemDto[];
}) {
  if (requisitions.length === 0) {
    return (
      <EmptyState
        title="You haven't submitted any requests yet"
        description="Create a new requisition to ask the stockroom for parts."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="p-2 font-medium">Request</th>
            <th className="p-2 font-medium">Submitted</th>
            <th className="p-2 font-medium">For</th>
            <th className="p-2 font-medium">Delivery</th>
            <th className="p-2 text-right font-medium">Items</th>
            <th className="p-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requisitions.map((requisition) => (
            <tr key={requisition.requisitionId}>
              <td className="p-2">
                <Link
                  href={`/requisitions/${requisition.requisitionId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  #{requisition.requisitionId}
                </Link>
                {requisition.isUrgent && (
                  <UrgentBadge className="ml-2" />
                )}
              </td>
              <td className="p-2">{dateFormat.format(requisition.submittedAt)}</td>
              <td className="p-2">{requisition.requesterName}</td>
              <td className="p-2">
                <div>{deliveryDateFormat.format(new Date(`${requisition.deliveryDate}T00:00:00Z`))}</div>
                <div className="text-xs text-muted-foreground">{requisition.deliveryLocation}</div>
              </td>
              <td className="p-2 text-right tabular-nums">{requisition.lineCount}</td>
              <td className="p-2">
                <RequisitionStatusBadge status={requisition.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
