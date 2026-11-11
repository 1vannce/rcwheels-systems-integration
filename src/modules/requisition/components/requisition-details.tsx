import Link from "next/link";

import { formatQuantity } from "@/modules/inventory";

import type { RequisitionDetailDto } from "../types/requisition.dto";
import { RequisitionStatusBadge, requisitionStatusLabels } from "./requisition-status-badge";

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
  backHref = "/requisitions",
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
      <div className="flex flex-col gap-1">
        <Link href={backHref} className="text-sm underline underline-offset-4">
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Requisition #{requisition.requisitionId}</h1>
          <RequisitionStatusBadge status={requisition.status} />
          {requisition.isUrgent && (
            <span className="text-xs font-medium text-destructive">Urgent</span>
          )}
        </div>
      </div>

      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Submitted by</dt>
          <dd>
            {requisition.submittedByName} on {dateFormat.format(requisition.submittedAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">For</dt>
          <dd>{requisition.requesterName}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Delivery date</dt>
          <dd>
            {deliveryDateFormat.format(new Date(`${requisition.deliveryDate}T00:00:00Z`))}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Delivery location</dt>
          <dd>{requisition.deliveryLocation}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <dt className="text-muted-foreground">Purpose</dt>
          <dd>{requisition.purpose}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Items</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
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
                    {line.itemCode} · {line.itemName}{" "}
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
                  <td className="p-2 text-right tabular-nums">
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
        <h2 className="font-medium">History</h2>
        <ol className="flex flex-col gap-2">
          {history.map((entry) => (
            <li key={entry.historyId} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {entry.fromStatus
                    ? `${requisitionStatusLabels[entry.fromStatus]} → ${requisitionStatusLabels[entry.toStatus]}`
                    : `Submitted as ${requisitionStatusLabels[entry.toStatus]}`}
                </span>
                <span className="text-muted-foreground">
                  {dateFormat.format(entry.changedAt)} · {entry.changedByName}
                </span>
              </div>
              {entry.reason && <p className="text-muted-foreground">{entry.reason}</p>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
