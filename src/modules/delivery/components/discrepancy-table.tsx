import Link from "next/link";

import type { InternalDiscrepancy, InternalDiscrepancyStatus } from "../types/delivery.type";
import { formatDateTime } from "../utils/date.util";
import { formatQuantity } from "../utils/quantity.util";
import { ResolveDiscrepancyForm } from "./resolve-discrepancy-form";

const statusLabels: Record<InternalDiscrepancyStatus, string> = {
  pending_resolution: "Pending Resolution",
  replacement_approved: "Replacement Approved",
  cancelled: "Cancelled",
};

const statusTones: Record<InternalDiscrepancyStatus, string> = {
  pending_resolution: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  replacement_approved:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "border-border bg-muted text-muted-foreground",
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
      <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No discrepancy reports. Rejected items on a delivery show up here.
      </p>
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
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${statusTones[rdr.status]}`}
              >
                {statusLabels[rdr.status]}
              </span>
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
