import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatQuantity } from "@/modules/inventory";

import type {
  PurchaseRequisitionDto,
  PurchaseRequisitionReason,
  PurchaseRequisitionStatus,
} from "../types/purchasing.dto";
import { formatPrNumber } from "../utils/pr-number.util";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const reasonLabels: Record<PurchaseRequisitionReason, string> = {
  shortage: "Shortage",
  reorder: "Reorder",
};

const statusTone: Record<PurchaseRequisitionStatus, "waiting" | "done" | "closed"> = {
  open: "waiting",
  covered: "done",
  cancelled: "closed",
};

/**
 * The Purchasing Staff queue of open purchase requests. Shortage PRs link back
 * to the request that created the demand; reorder PRs have no source request.
 */
export function PurchaseRequisitionQueue({ requests }: { requests: PurchaseRequisitionDto[] }) {
  if (requests.length === 0) {
    return (
      <EmptyState
        title="No open purchase requests"
        description="A shortage found during a stock check will appear here, ready for a purchase order."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="p-3 font-medium">PR number</th>
            <th className="p-3 font-medium">Requested</th>
            <th className="p-3 font-medium">Reason</th>
            <th className="p-3 font-medium">Source request</th>
            <th className="p-3 font-medium">Items</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {requests.map((request) => {
            const sourceRequisitionId =
              request.lines.find((line) => line.requisitionId !== null)?.requisitionId ?? null;

            return (
              <tr key={request.purchaseRequisitionId} className="hover:bg-muted/50">
                <td className="p-3 align-top font-medium whitespace-nowrap">
                  {formatPrNumber(request.purchaseRequisitionId)}
                </td>
                <td className="p-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {dateFormat.format(request.requestedAt)}
                  <p className="mt-0.5">by {request.requestedByName}</p>
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  {reasonLabels[request.requestReason]}
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  {sourceRequisitionId === null ? (
                    <span className="text-xs text-muted-foreground">Inventory reorder</span>
                  ) : (
                    <span>Request #{sourceRequisitionId}</span>
                  )}
                </td>
                <td className="p-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {request.lines.map((line) => (
                      <span
                        key={line.purchaseRequisitionLineId}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-xs"
                      >
                        <span className="font-medium">{line.itemCode}</span>
                        <span>
                          ×{formatQuantity(line.requestedQty)} {line.unit}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  <StatusBadge tone={statusTone[request.status]}>
                    {request.status === "open"
                      ? "Open"
                      : request.status === "covered"
                        ? "Covered"
                        : "Cancelled"}
                  </StatusBadge>
                </td>
                <td className="p-3 align-top text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        href={`/purchasing/orders?purchaseRequisitionId=${request.purchaseRequisitionId}`}
                      />
                    }
                  >
                    Prepare PO
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
