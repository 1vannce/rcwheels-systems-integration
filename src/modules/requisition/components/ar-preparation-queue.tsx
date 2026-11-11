import Link from "next/link";

import type { RequisitionListItemDto } from "../types/requisition.dto";
import { RequisitionStatusBadge } from "./requisition-status-badge";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/**
 * Requests with reserved stock and no acknowledgement receipt yet. Each row
 * opens the detail screen where the Custodian prepares the dispatch and AR.
 */
export function ArPreparationQueue({
  requisitions,
}: {
  requisitions: RequisitionListItemDto[];
}) {
  if (requisitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reserved requests are waiting for an acknowledgement receipt.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="p-2 font-medium">Request</th>
            <th className="p-2 font-medium">Submitted</th>
            <th className="p-2 font-medium">For</th>
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
                  className="underline underline-offset-4"
                >
                  #{requisition.requisitionId}
                </Link>
                {requisition.isUrgent && (
                  <span className="ml-2 text-xs font-medium text-destructive">Urgent</span>
                )}
              </td>
              <td className="p-2">{dateFormat.format(requisition.submittedAt)}</td>
              <td className="p-2">{requisition.requesterName}</td>
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
