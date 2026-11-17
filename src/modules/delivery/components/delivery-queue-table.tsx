import Link from "next/link";

import type { PendingDelivery } from "../types/delivery.type";
import { formatDateTime } from "../utils/date.util";
import { formatQuantity } from "../utils/quantity.util";

/**
 * Released deliveries waiting for the requester's signature (connector C).
 * Read-only: delivery staff bring the items, and the requester signs.
 */
export function DeliveryQueueTable({
  deliveries,
  emptyMessage,
}: {
  deliveries: PendingDelivery[];
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Request</th>
            <th className="p-3 font-medium">Deliver to</th>
            <th className="p-3 font-medium">Items</th>
            <th className="p-3 font-medium">Delivery person</th>
            <th className="p-3 font-medium">Dispatched</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {deliveries.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            deliveries.map((delivery) => (
              <tr key={delivery.dispatchId} className="align-top">
                <td className="p-3 whitespace-nowrap">
                  <Link
                    href={`/requisitions/${delivery.requisitionId}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {delivery.rfNumber}
                  </Link>
                  {delivery.isUrgent && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Urgent
                    </p>
                  )}
                </td>
                <td className="p-3">
                  <p className="font-medium">{delivery.requesterName}</p>
                  <p className="text-xs text-muted-foreground">{delivery.deliveryLocation}</p>
                </td>
                <td className="p-3">
                  <ul className="flex flex-col gap-1">
                    {delivery.lines.map((line) => (
                      <li key={line.dispatchLineId} className="tabular-nums">
                        {formatQuantity(line.sentQty)} {line.unit}{" "}
                        <span className="text-muted-foreground">
                          {line.itemCode} {line.itemName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-3">{delivery.deliveryPersonnel}</td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatDateTime(delivery.dispatchedAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
