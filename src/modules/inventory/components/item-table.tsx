import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

import { compareQuantities, formatQuantity } from "../services/quantity.service";
import type { ItemStock } from "../types/stock.type";

export function ItemTable({ items }: { items: ItemStock[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No items yet"
        description="Add the first item with the form below. Stock starts at zero until a receipt or approved count is posted."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2 text-right">Usable</th>
            <th className="px-3 py-2 text-right">Reserved</th>
            <th className="px-3 py-2 text-right text-foreground">Available</th>
            <th className="px-3 py-2 text-right">In transit</th>
            <th className="px-3 py-2 text-right">Held</th>
            <th className="px-3 py-2 text-right">Damaged</th>
            <th className="px-3 py-2 text-right">Reorder point</th>
            <th className="px-3 py-2">Stock check</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const isLow =
              !item.isIncomplete && compareQuantities(item.available, item.reorderPoint) <= 0;

            return (
              <tr key={item.itemId}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link
                    href={`/inventory/items/${item.itemId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {item.itemCode}
                  </Link>
                </td>
                <td className="px-3 py-2">{item.itemName}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.unit}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(item.usable)}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(item.reserved)}</td>
                <td className="bg-accent/50 px-3 py-2 text-right font-semibold">
                  {formatQuantity(item.available)}
                </td>
                <td className="px-3 py-2 text-right">{formatQuantity(item.inTransit)}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(item.held)}</td>
                <td className="px-3 py-2 text-right">{formatQuantity(item.damaged)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {formatQuantity(item.reorderPoint)}
                </td>
                <td className="px-3 py-2">
                  {item.isIncomplete && <StatusBadge tone="stopped">Needs a count</StatusBadge>}
                  {isLow && <StatusBadge tone="waiting">At or below reorder point</StatusBadge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
