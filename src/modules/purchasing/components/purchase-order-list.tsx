import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatQuantity } from "@/modules/inventory";

import type { PurchaseOrderDto, PurchaseOrderStatus } from "../types/purchasing.dto";
import { formatPoNumber } from "../utils/po-number.util";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const statusLabels: Record<PurchaseOrderStatus, string> = {
  pending_approval: "Pending Approval",
  for_revision: "For Revision",
  approved: "Approved",
  placed: "Placed",
  partially_received: "Partially Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

const statusTones: Record<PurchaseOrderStatus, StatusTone> = {
  pending_approval: "waiting",
  for_revision: "review",
  approved: "active",
  placed: "active",
  partially_received: "active",
  closed: "done",
  cancelled: "closed",
};

function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Active POs prepared by the Purchasing Staff. */
export function PurchaseOrderList({ orders }: { orders: PurchaseOrderDto[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No purchase orders yet"
        description="Open a purchase request and prepare a PO from its remaining quantity."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="p-3 font-medium">PO number</th>
            <th className="p-3 font-medium">Supplier</th>
            <th className="p-3 font-medium">Source PR</th>
            <th className="p-3 font-medium">Items</th>
            <th className="p-3 text-right font-medium">Total</th>
            <th className="p-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((order) => {
            const sourcePr =
              order.lines.find((line) => line.purchaseRequisitionId !== null)
                ?.purchaseRequisitionId ?? null;
            const total = order.lines.reduce((sum, line) => {
              const lineTotal = Number(line.orderedQty) * Number(line.unitPrice);

              return sum + (Number.isNaN(lineTotal) ? 0 : lineTotal);
            }, 0);

            return (
              <tr key={order.purchaseOrderId} className="hover:bg-muted/50">
                <td className="p-3 align-top font-medium whitespace-nowrap">
                  <Link
                    href={`/purchasing/orders/${order.purchaseOrderId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {formatPoNumber(order.purchaseOrderId)}
                  </Link>
                  {order.orderedAt && (
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {dateFormat.format(order.orderedAt)}
                    </p>
                  )}
                </td>
                <td className="p-3 align-top">
                  <p className="font-medium">{order.supplierName}</p>
                  <p className="text-xs text-muted-foreground">
                    prepared by {order.preparedByName}
                  </p>
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  {sourcePr === null ? (
                    <span className="text-xs text-muted-foreground">Inventory reorder</span>
                  ) : (
                    <Link
                      href={`/purchasing/orders?purchaseRequisitionId=${sourcePr}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      PR #{sourcePr}
                    </Link>
                  )}
                </td>
                <td className="p-3 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {order.lines.map((line) => (
                      <span
                        key={line.purchaseOrderLineId}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-xs"
                      >
                        <span className="font-medium">{line.itemCode}</span>
                        <span>
                          ×{formatQuantity(line.orderedQty)} {line.unit}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3 align-top text-right font-medium tabular-nums whitespace-nowrap">
                  {formatMoney(total)}
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  <StatusBadge tone={statusTones[order.status]}>
                    {statusLabels[order.status]}
                  </StatusBadge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
