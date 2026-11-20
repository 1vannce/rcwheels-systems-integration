import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatQuantity, subtractQuantities } from "@/modules/inventory";

import type {
  PurchaseOrderDto,
  PurchaseOrderLineDto,
  PurchaseOrderStatus,
} from "../types/purchasing.dto";
import { formatCents, lineTotalCents, sumCents } from "../utils/money.util";
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

function lineValues(line: PurchaseOrderLineDto) {
  const committedQty = subtractQuantities(line.orderedQty, line.cancelledQty);

  return {
    committedCents: lineTotalCents(committedQty, line.unitPrice),
    receivedCents: lineTotalCents(line.acceptedQty, line.unitPrice),
    outstandingCents: lineTotalCents(line.outstandingQty, line.unitPrice),
  };
}

function formatDate(value: Date | null): string {
  return value ? dateFormat.format(value) : "—";
}

/** Approved, placed, and partially received POs with open commitments. */
export function OpenPurchaseOrderList({
  orders,
}: {
  orders: PurchaseOrderDto[];
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No open purchase orders"
        description="Approved, placed, and partially received purchase orders appear here."
      />
    );
  }

  const rows = orders.map((order) => {
    const lines = order.lines.map((line) => ({
      line,
      ...lineValues(line),
    }));

    return {
      order,
      lines,
      committedCents: sumCents(lines.map((row) => row.committedCents)),
      receivedCents: sumCents(lines.map((row) => row.receivedCents)),
      outstandingCents: sumCents(lines.map((row) => row.outstandingCents)),
    };
  });

  const totals = {
    committedCents: sumCents(rows.map((row) => row.committedCents)),
    receivedCents: sumCents(rows.map((row) => row.receivedCents)),
    outstandingCents: sumCents(rows.map((row) => row.outstandingCents)),
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open purchase orders</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {orders.length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Committed value</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCents(totals.committedCents)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Received value</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCents(totals.receivedCents)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Outstanding value</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatCents(totals.outstandingCents)}
          </p>
        </div>
      </section>

      {rows.map(
        ({ order, lines, committedCents, receivedCents, outstandingCents }) => (
          <section
            key={order.purchaseOrderId}
            className="rounded-lg border bg-card p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {formatPoNumber(order.purchaseOrderId)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {order.supplierName} · prepared by {order.preparedByName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Approved {formatDate(order.approvedAt)}
                  {order.orderedAt
                    ? ` · Ordered ${formatDate(order.orderedAt)}`
                    : " · Not yet placed"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Version {order.currentVersion}
                </span>
                <StatusBadge tone={statusTones[order.status]}>
                  {statusLabels[order.status]}
                </StatusBadge>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="p-3 font-medium">Item</th>
                    <th className="p-3 text-right font-medium">Ordered</th>
                    <th className="p-3 text-right font-medium">Cancelled</th>
                    <th className="p-3 text-right font-medium">Accepted</th>
                    <th className="p-3 text-right font-medium">Outstanding</th>
                    <th className="p-3 text-right font-medium">Committed</th>
                    <th className="p-3 text-right font-medium">Received</th>
                    <th className="p-3 text-right font-medium">
                      Outstanding value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map(
                    ({
                      line,
                      committedCents: lineCommitted,
                      receivedCents: lineReceived,
                      outstandingCents: lineOutstanding,
                    }) => (
                      <tr key={line.purchaseOrderLineId}>
                        <td className="p-3">
                          <span className="font-medium">{line.itemCode}</span>{" "}
                          {line.itemName}{" "}
                          <span className="text-muted-foreground">
                            ({line.unit})
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatQuantity(line.orderedQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatQuantity(line.cancelledQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatQuantity(line.acceptedQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatQuantity(line.outstandingQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatCents(lineCommitted)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatCents(lineReceived)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatCents(lineOutstanding)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="p-3 text-right font-medium" colSpan={5}>
                      PO totals
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatCents(committedCents)}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatCents(receivedCents)}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatCents(outstandingCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ),
      )}
    </div>
  );
}
