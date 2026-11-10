import { formatQuantity } from "../services/quantity.service";
import type { SalesDeduction } from "../types/stock.type";
import { ReverseSaleForm } from "./reverse-sale-form";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

// The event key is "sales:<reference>:<item ID>".
function salesReference(eventKey: string): string {
  return eventKey.replace(/^sales:/, "").replace(/:\d+$/, "");
}

export function SalesDeductionTable({ deductions }: { deductions: SalesDeduction[] }) {
  if (deductions.length === 0) {
    return <p className="text-sm text-muted-foreground">No sales deductions yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="p-2 font-medium">Posted</th>
            <th className="p-2 font-medium">Sales reference</th>
            <th className="p-2 font-medium">Item</th>
            <th className="p-2 text-right font-medium">Quantity</th>
            <th className="p-2 font-medium">Correction</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {deductions.map((deduction) => (
            <tr key={deduction.movementId}>
              <td className="p-2">{dateFormat.format(deduction.postedAt)}</td>
              <td className="p-2">{salesReference(deduction.eventKey)}</td>
              <td className="p-2">
                {deduction.itemCode} · {deduction.itemName}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatQuantity(deduction.quantity)} {deduction.unit}
              </td>
              <td className="p-2">
                {deduction.reversedByMovementId ? (
                  "Reversed"
                ) : (
                  <ReverseSaleForm movementId={deduction.movementId} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
