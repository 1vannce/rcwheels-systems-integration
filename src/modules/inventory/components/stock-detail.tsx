import { formatQuantity } from "../services/quantity.service";
import type { ItemStock, MovementType, StockMovement } from "../types/stock.type";

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
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {item.specification} · unit: {item.unit} · average cost: {item.averageCost} · reorder
          point: {formatQuantity(item.reorderPoint)}
        </p>
        {item.isIncomplete && (
          <p role="alert" className="text-sm text-destructive">
            This balance is flagged incomplete. It needs an approved physical count before
            stock can be reserved.
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatQuantity(value)}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Movements</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2 font-medium">Posted</th>
                  <th className="p-2 font-medium">Event</th>
                  <th className="p-2 font-medium">Balance</th>
                  <th className="p-2 text-right font-medium">Change</th>
                  <th className="p-2 font-medium">Source reference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((movement) => (
                  <tr key={movement.movementId}>
                    <td className="p-2">{dateFormat.format(movement.postedAt)}</td>
                    <td className="p-2">{movementLabels[movement.movementType]}</td>
                    <td className="p-2">{movement.condition}</td>
                    <td className="p-2 text-right tabular-nums">
                      {movement.quantityDelta.startsWith("-") ? "" : "+"}
                      {formatQuantity(movement.quantityDelta)}
                    </td>
                    <td className="p-2 font-mono text-xs">{movement.eventKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
