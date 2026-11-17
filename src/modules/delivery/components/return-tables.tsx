import Link from "next/link";

import type { InternalDiscrepancy, ReturnLineToInspect } from "../types/delivery.type";
import { formatDateTime } from "../utils/date.util";
import { formatQuantity, subtractQuantities } from "../utils/quantity.util";
import { InspectReturnForm, ReceiveReturnForm } from "./return-forms";

/**
 * Rejected items not yet back in the stockroom. Custodians and delivery staff
 * get a receive form on each row; other roles see the list read-only.
 */
export function ReturnsToReceiveTable({
  reports,
  canReceive,
}: {
  reports: InternalDiscrepancy[];
  canReceive: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Request</th>
            <th className="p-3 font-medium">Item</th>
            <th className="p-3 font-medium">Problem</th>
            <th className="p-3 font-medium">Still to return</th>
            {canReceive && <th className="p-3 font-medium">Receive</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {reports.length === 0 ? (
            <tr>
              <td colSpan={canReceive ? 5 : 4} className="p-8 text-center text-muted-foreground">
                No rejected items are waiting to come back.
              </td>
            </tr>
          ) : (
            reports.map((rdr) => {
              const remaining = subtractQuantities(rdr.affectedQty, rdr.returnedQty);

              return (
                <tr key={rdr.internalDiscrepancyId} className="align-top">
                  <td className="p-3 whitespace-nowrap">
                    <Link
                      href={`/requisitions/${rdr.requisitionId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {rdr.rfNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{rdr.requesterName}</p>
                  </td>
                  <td className="p-3">
                    {rdr.itemCode} {rdr.itemName}
                  </td>
                  <td className="p-3">{rdr.problem}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums">
                    {formatQuantity(remaining)} {rdr.unit}
                  </td>
                  {canReceive && (
                    <td className="p-3">
                      <ReceiveReturnForm
                        internalDiscrepancyId={rdr.internalDiscrepancyId}
                        requisitionId={rdr.requisitionId}
                        remainingQty={formatQuantity(remaining)}
                        unit={rdr.unit}
                      />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Returned lines in held stock. Only the Custodian records the inspection;
 * other roles see the list read-only.
 */
export function ReturnsToInspectTable({
  lines,
  canInspect,
}: {
  lines: ReturnLineToInspect[];
  canInspect: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Request</th>
            <th className="p-3 font-medium">Item</th>
            <th className="p-3 font-medium">Held</th>
            <th className="p-3 font-medium">Returned</th>
            <th className="p-3 font-medium">{canInspect ? "Inspection result" : "State"}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-8 text-center text-muted-foreground">
                No returned items are waiting for inspection.
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <tr key={line.returnLineId} className="align-top">
                <td className="p-3 whitespace-nowrap">
                  <Link
                    href={`/requisitions/${line.requisitionId}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {line.rfNumber}
                  </Link>
                </td>
                <td className="p-3">
                  <p>
                    {line.itemCode} {line.itemName}
                  </p>
                  <p className="text-xs text-muted-foreground">Reported: {line.problem}</p>
                </td>
                <td className="p-3 whitespace-nowrap tabular-nums">
                  {formatQuantity(line.returnedQty)} {line.unit}
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateTime(line.returnedAt)}
                  <p className="text-xs">by {line.receivedByName}</p>
                </td>
                <td className="p-3">
                  {line.inspectedAt && (
                    <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                      Uncertain on {formatDateTime(line.inspectedAt)}; inspect again.
                    </p>
                  )}
                  {canInspect ? (
                    <InspectReturnForm returnLineId={line.returnLineId} />
                  ) : (
                    !line.inspectedAt && (
                      <span className="text-muted-foreground">Waiting for inspection</span>
                    )
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
