import Link from "next/link";

import { compareQuantities, formatQuantity } from "../services/quantity.service";
import type { ItemStock } from "../types/stock.type";

export function ItemTable({ items }: { items: ItemStock[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No items yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="p-2 font-medium">Code</th>
            <th className="p-2 font-medium">Item</th>
            <th className="p-2 font-medium">Unit</th>
            <th className="p-2 text-right font-medium">Usable</th>
            <th className="p-2 text-right font-medium">Reserved</th>
            <th className="p-2 text-right font-medium">Available</th>
            <th className="p-2 text-right font-medium">In transit</th>
            <th className="p-2 text-right font-medium">Held</th>
            <th className="p-2 text-right font-medium">Damaged</th>
            <th className="p-2 text-right font-medium">Reorder point</th>
            <th className="p-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.itemId}>
              <td className="p-2">
                <Link
                  href={`/inventory/items/${item.itemId}`}
                  className="underline underline-offset-4"
                >
                  {item.itemCode}
                </Link>
              </td>
              <td className="p-2">{item.itemName}</td>
              <td className="p-2">{item.unit}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(item.usable)}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(item.reserved)}</td>
              <td className="p-2 text-right font-medium tabular-nums">
                {formatQuantity(item.available)}
              </td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(item.inTransit)}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(item.held)}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(item.damaged)}</td>
              <td className="p-2 text-right tabular-nums">
                {formatQuantity(item.reorderPoint)}
              </td>
              <td className="p-2">
                {item.isIncomplete && (
                  <span className="text-destructive">Incomplete: needs a count</span>
                )}
                {!item.isIncomplete &&
                  compareQuantities(item.available, item.reorderPoint) <= 0 &&
                  "At or below reorder point"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
