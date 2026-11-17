import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

import { formatQuantity, subtractQuantities } from "../services/quantity.service";
import type { StockAdjustment } from "../types/stock.type";
import { AdjustmentDecision } from "./adjustment-decision";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const conditionLabels = { usable: "Usable", hold: "Held", damaged: "Damaged" };

export function AdjustmentTable({
  adjustments,
  canDecide,
  currentUserId,
}: {
  adjustments: StockAdjustment[];
  canDecide: boolean;
  currentUserId: number;
}) {
  if (adjustments.length === 0) {
    return (
      <EmptyState
        title="No stock counts recorded yet"
        description="When a physical count differs from the system balance, the Custodian records it here for an Inventory Manager to approve."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="p-2 font-medium">Date</th>
            <th className="p-2 font-medium">Item</th>
            <th className="p-2 font-medium">Balance</th>
            <th className="p-2 text-right font-medium">Recorded</th>
            <th className="p-2 text-right font-medium">Counted</th>
            <th className="p-2 text-right font-medium">Difference</th>
            <th className="p-2 font-medium">Reason</th>
            <th className="p-2 font-medium">Counted by</th>
            <th className="p-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {adjustments.map((adjustment) => {
            const difference = subtractQuantities(
              adjustment.countedQty,
              adjustment.recordedQty,
            );

            return (
              <tr key={adjustment.adjustmentId}>
                <td className="p-2 whitespace-nowrap">{dateFormat.format(adjustment.countedAt)}</td>
                <td className="p-2">
                  <span className="font-medium">{adjustment.itemCode}</span> {adjustment.itemName}
                </td>
                <td className="p-2">{conditionLabels[adjustment.condition]}</td>
                <td className="p-2 text-right tabular-nums">
                  {formatQuantity(adjustment.recordedQty)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatQuantity(adjustment.countedQty)}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {difference.startsWith("-") ? "" : "+"}
                  {formatQuantity(difference)}
                </td>
                <td className="p-2">{adjustment.reason}</td>
                <td className="p-2">{adjustment.countedByName}</td>
                <td className="p-2">
                  {adjustment.status === "pending" &&
                  canDecide &&
                  adjustment.countedById !== currentUserId ? (
                    <AdjustmentDecision adjustmentId={adjustment.adjustmentId} />
                  ) : (
                    <>
                      {adjustment.status === "pending" && (
                        <StatusBadge tone="waiting">Waiting for approval</StatusBadge>
                      )}
                      {adjustment.status === "approved" && (
                        <StatusBadge tone="done">
                          Approved by {adjustment.approvedByName}
                        </StatusBadge>
                      )}
                      {adjustment.status === "rejected" && (
                        <StatusBadge tone="stopped">Rejected</StatusBadge>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
