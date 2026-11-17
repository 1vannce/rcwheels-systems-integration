import { EmptyState } from "@/components/ui/empty-state";

import { formatQuantity } from "../services/quantity.service";
import type {
  ItemStock,
  MovementType,
  StockCondition,
  StockMovement,
} from "../types/stock.type";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const movementLabels: Record<MovementType, string> = {
  supplier_receipt: "Supplier receipt accepted",
  dispatch: "Dispatched",
  acceptance: "Accepted by requester",
  return: "Returned to hold",
  return_inspection: "Return inspected",
  sales_deduction: "Sales deduction",
  sales_reversal: "Sales reversal",
  adjustment: "Approved adjustment",
  supplier_return: "Returned to supplier",
  opening_balance: "Opening balance",
  reservation: "Reserved",
  reservation_release: "Reservation released",
};

const conditionLabels: Record<StockCondition, string> = {
  usable: "Usable",
  hold: "Held",
  damaged: "Damaged",
};

export function StockDetail({
  item,
  movements,
}: {
  item: ItemStock;
  movements: StockMovement[];
}) {
  const figures = [
    ["Usable on hand", item.usable],
    ["Reserved", item.reserved],
    ["Available", item.available],
    ["In transit", item.inTransit],
    ["Held", item.held],
    ["Damaged", item.damaged],
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Specification</dt>
          <dd>{item.specification}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Unit</dt>
          <dd>{item.unit}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Average cost</dt>
          <dd className="tabular-nums">{item.averageCost}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Reorder point</dt>
          <dd className="tabular-nums">{formatQuantity(item.reorderPoint)}</dd>
        </div>
      </dl>
      {item.isIncomplete && (
        <p
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
        >
          This balance is flagged incomplete. It needs an approved physical count before
          stock can be reserved.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([label, value]) => (
          <div
            key={label}
            className={`flex flex-col gap-1 p-3 ${
              label === "Available" ? "bg-accent text-accent-foreground" : "bg-card"
            }`}
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums [font-stretch:85%]">
              {formatQuantity(value)}
            </dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Movements</h2>
        {movements.length === 0 ? (
          <EmptyState
            title="No movements yet"
            description="Receipts, reservations, dispatches, sales, and approved counts for this item will be listed here."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="p-2">Posted</th>
                  <th className="p-2">Event</th>
                  <th className="p-2">Balance</th>
                  <th className="p-2 text-right">Change</th>
                  <th className="p-2">Source reference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((movement) => {
                  const isOut = movement.quantityDelta.startsWith("-");

                  return (
                    <tr key={movement.movementId}>
                      <td className="p-2 whitespace-nowrap">
                        {dateFormat.format(movement.postedAt)}
                      </td>
                      <td className="p-2">{movementLabels[movement.movementType]}</td>
                      <td className="p-2">{conditionLabels[movement.condition]}</td>
                      <td
                        className={`p-2 text-right font-medium ${
                          isOut ? "" : "text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {isOut ? "" : "+"}
                        {formatQuantity(movement.quantityDelta)}
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        {movement.eventKey}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
