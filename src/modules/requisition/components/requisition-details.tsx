import PageHeader from "@/components/page-header";
import { UrgentBadge } from "@/components/ui/status-badge";
import { formatQuantity } from "@/modules/inventory";

import type { RequisitionDetailDto } from "../types/requisition.dto";
import { formatRfNumber } from "../utils/rf-number.util";
import {
  RequisitionStatusBadge,
  requisitionStatusLabels,
} from "./requisition-status-badge";

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
 * One request with its header, lines, and append-only status history.
 *
 * Quantities are derived by the repository, never stored on the line, so every
 * figure here agrees with the stock ledger and dispatch records.
 */
export function RequisitionDetails({
  detail,
  backHref = "/requisitions/my-requests",
  backLabel = "Back to my requests",
}: {
  detail: RequisitionDetailDto;
  /** Where the "back" link points; the approval queue passes its own screen. */
  backHref?: string;
  backLabel?: string;
}) {
  const { requisition, lines, history } = detail;

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        title={
          <>
            <span className="sr-only">Requisition form </span>
            <span className="text-3xl font-bold tabular-nums tracking-tight [font-stretch:75%] sm:text-4xl">
              {formatRfNumber(requisition.requisitionId, requisition.submittedAt)}
            </span>
          </>
        }
        badges={
          <>
            <RequisitionStatusBadge status={requisition.status} />
            {requisition.isUrgent && <UrgentBadge />}
          </>
        }
      />

      <dl className="grid gap-x-6 gap-y-4 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Submitted by</dt>
          <dd className="font-medium">{requisition.submittedByName}</dd>
          <dd className="text-xs text-muted-foreground tabular-nums">
            {dateFormat.format(requisition.submittedAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">For</dt>
          <dd className="font-medium">{requisition.requesterName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Deliver by</dt>
          <dd className="font-medium tabular-nums">
            {deliveryDateFormat.format(
              new Date(`${requisition.deliveryDate}T00:00:00Z`),
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Deliver to</dt>
          <dd className="font-medium">{requisition.deliveryLocation}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-4">
          <dt className="text-xs text-muted-foreground">Purpose</dt>
          <dd className="max-w-[75ch]">{requisition.purpose}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Items</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-2 font-medium">Item</th>
                <th className="p-2 text-right font-medium">Requested</th>
                <th className="p-2 text-right font-medium">Approved</th>
                <th className="p-2 text-right font-medium">Cancelled</th>
                <th className="p-2 text-right font-medium">Reserved</th>
                <th className="p-2 text-right font-medium">Dispatched</th>
                <th className="p-2 text-right font-medium">Accepted</th>
                <th className="p-2 text-right font-medium">Returned</th>
                <th className="p-2 text-right font-medium">Outstanding</th>
                <th className="p-2 text-right font-medium">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => (
                <tr key={line.requisitionLineId}>
                  <td className="p-2">
                    <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                    <span className="text-muted-foreground">({line.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.requestedQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.approvedQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.cancelledQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.reservedQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.dispatchedQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.acceptedQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.returnedQty)}
                  </td>
                  <td className="bg-accent/50 p-2 text-right font-semibold tabular-nums">
                    {formatQuantity(line.outstandingQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.availableStock)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">History</h2>
        <ol className="flex flex-col border-l-2 pl-4">
          {history.map((entry) => (
            <li
              key={entry.historyId}
              className="relative flex flex-col gap-0.5 pb-4 text-sm last:pb-0 before:absolute before:top-1.5 before:-left-[21px] before:size-2 before:rounded-full before:bg-foreground/70"
            >
              <span className="font-medium">
                {entry.fromStatus
                  ? `${requisitionStatusLabels[entry.fromStatus]} to ${requisitionStatusLabels[entry.toStatus]}`
                  : `Submitted as ${requisitionStatusLabels[entry.toStatus]}`}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {entry.changedByName}, {dateFormat.format(entry.changedAt)}
              </span>
              {entry.reason && (
                <p className="mt-1 max-w-[75ch] rounded-md bg-muted px-3 py-2">{entry.reason}</p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
