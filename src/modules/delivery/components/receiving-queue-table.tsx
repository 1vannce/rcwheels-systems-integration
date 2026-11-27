import Link from "next/link";

import { formatPoNumber, type PurchaseOrderDto } from "@/modules/purchasing";

import { formatDateTime } from "../utils/date.util";
import { compareQuantities, formatQuantity } from "../utils/quantity.util";

/**
 * Placed and partially received POs waiting for supplier receiving
 * (connector E), with what is still outstanding on each line.
 */
export function ReceivingQueueTable({
  orders,
  canReceive,
}: {
  orders: PurchaseOrderDto[];
  canReceive: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="data-table text-left">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="p-3 font-medium">Purchase order</th>
            <th className="p-3 font-medium">Supplier</th>
            <th className="p-3 font-medium">Outstanding</th>
            <th className="p-3 font-medium">Placed</th>
            {canReceive && <th className="p-3 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.length === 0 ? (
            <tr>
              <td colSpan={canReceive ? 5 : 4} className="p-8 text-center text-muted-foreground">
                No supplier deliveries are expected. Placed purchase orders appear here.
              </td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr key={order.purchaseOrderId} className="align-top">
                <td className="p-3 whitespace-nowrap">
                  <p className="font-medium">{formatPoNumber(order.purchaseOrderId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.status === "partially_received" ? "Partially Received" : "Placed"}
                  </p>
                </td>
                <td className="p-3">{order.supplierName}</td>
                <td className="p-3">
                  <ul className="flex flex-col gap-1">
                    {order.lines
                      .filter((line) => compareQuantities(line.outstandingQty, "0") > 0)
                      .map((line) => (
                        <li key={line.purchaseOrderLineId} className="tabular-nums">
                          {formatQuantity(line.outstandingQty)} of{" "}
                          {formatQuantity(line.orderedQty)} {line.unit}{" "}
                          <span className="text-muted-foreground">
                            {line.itemCode} {line.itemName}
                          </span>
                        </li>
                      ))}
                  </ul>
                </td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {order.orderedAt ? formatDateTime(order.orderedAt) : "—"}
                </td>
                {canReceive && (
                  <td className="p-3 whitespace-nowrap">
                    <Link
                      href={`/delivery/receiving/${order.purchaseOrderId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Receive
                    </Link>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
