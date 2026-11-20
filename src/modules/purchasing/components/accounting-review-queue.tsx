import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatQuantity } from "@/modules/inventory";

import type { PurchaseOrderDto } from "../types/purchasing.dto";
import { formatPoNumber } from "../utils/po-number.util";
import { PurchaseOrderReviewActions } from "./purchase-order-review-actions";

function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Pending POs waiting for Accounting's budget decision. */
export function AccountingReviewQueue({ orders }: { orders: PurchaseOrderDto[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No purchase orders waiting for review"
        description="A PO prepared by Purchasing Staff appears here for Accounting's budget decision."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => {
        const sourcePr = order.lines[0]?.purchaseRequisitionId ?? null;
        const total = order.lines.reduce((sum, line) => {
          const lineTotal = Number(line.orderedQty) * Number(line.unitPrice);

          return sum + (Number.isNaN(lineTotal) ? 0 : lineTotal);
        }, 0);

        return (
          <section key={order.purchaseOrderId} className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  <Link
                    href={`/purchasing/accounting-review/${order.purchaseOrderId}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {formatPoNumber(order.purchaseOrderId)}
                  </Link>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {order.supplierName} · prepared by {order.preparedByName}
                </p>
                {sourcePr !== null && (
                  <p className="text-xs text-muted-foreground">Source PR #{sourcePr}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Version {order.currentVersion}</span>
                <StatusBadge tone="waiting">Pending Approval</StatusBadge>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="p-2 font-medium">Item</th>
                    <th className="p-2 text-right font-medium">Quantity</th>
                    <th className="p-2 text-right font-medium">Unit price</th>
                    <th className="p-2 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {order.lines.map((line) => {
                    const lineTotal = Number(line.orderedQty) * Number(line.unitPrice);

                    return (
                      <tr key={line.purchaseOrderLineId}>
                        <td className="p-2">
                          <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                          <span className="text-muted-foreground">({line.unit})</span>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatQuantity(line.orderedQty)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatMoney(Number(line.unitPrice))}
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {formatMoney(Number.isNaN(lineTotal) ? 0 : lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Estimated total:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(total)}
                </span>
              </p>
              {order.deliveryTerms && (
                <p className="max-w-md text-xs text-muted-foreground">
                  Terms: {order.deliveryTerms}
                </p>
              )}
            </div>

            <PurchaseOrderReviewActions purchaseOrderId={order.purchaseOrderId} />
          </section>
        );
      })}
    </div>
  );
}
