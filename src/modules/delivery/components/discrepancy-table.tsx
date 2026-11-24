import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

import type { InternalDiscrepancy, InternalDiscrepancyStatus } from "../types/delivery.type";
import { formatDateTime } from "../utils/date.util";
import { formatQuantity } from "../utils/quantity.util";
import { ResolveDiscrepancyForm } from "./resolve-discrepancy-form";

const statusLabels: Record<InternalDiscrepancyStatus, string> = {
  pending_resolution: "Pending Resolution",
  replacement_approved: "Replacement Approved",
  cancelled: "Cancelled",
};

const statusTones: Record<InternalDiscrepancyStatus, StatusTone> = {
  pending_resolution: "review",
  replacement_approved: "active",
  cancelled: "closed",
};

/**
 * Requester Discrepancy Reports (RDRs). When `canResolve` is set, each open
 * report carries the approver's replace-or-cancel form.
 */
export function DiscrepancyTable({
  discrepancies,
  canResolve,
}: {
  discrepancies: InternalDiscrepancy[];
  canResolve: boolean;
}) {
  if (discrepancies.length === 0) {
    return (
      <EmptyState
        title="No discrepancy reports"
        description="Items a requester rejects on delivery show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {discrepancies.map((rdr) => {
        const open = rdr.status === "pending_resolution";

        return (
          <li key={rdr.internalDiscrepancyId} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">
                  RDR {rdr.internalDiscrepancyId} on{" "}
                  <Link
                    href={`/requisitions/${rdr.requisitionId}`}
                    className="underline underline-offset-4"
                  >
                    {rdr.rfNumber}
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  Reported by {rdr.reportedByName}, {formatDateTime(rdr.reportedAt)}
                </p>
              </div>
              <StatusBadge tone={statusTones[rdr.status]}>{statusLabels[rdr.status]}</StatusBadge>
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Item</dt>
                <dd>
                  {rdr.itemCode} {rdr.itemName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rejected</dt>
                <dd className="tabular-nums">
                  {formatQuantity(rdr.affectedQty)} {rdr.unit}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Returned to stockroom</dt>
                <dd className="tabular-nums">
                  {formatQuantity(rdr.returnedQty)} {rdr.unit}
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-muted-foreground">Problem</dt>
                <dd>{rdr.problem}</dd>
              </div>
              {rdr.resolutionAction && (
                <div className="sm:col-span-3">
                  <dt className="text-muted-foreground">Decision note</dt>
                  <dd>{rdr.resolutionAction}</dd>
                </div>
              )}
            </dl>

            {canResolve && open && (
              <ResolveDiscrepancyForm
                internalDiscrepancyId={rdr.internalDiscrepancyId}
                requisitionId={rdr.requisitionId}
                quantityLabel={`${formatQuantity(rdr.affectedQty)} ${rdr.unit}`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
