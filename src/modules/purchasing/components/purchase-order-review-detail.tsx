import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { compareQuantities, formatQuantity } from "@/modules/inventory";

import type {
  PurchaseOrderReviewContextDto,
  PurchaseOrderSnapshotLineChange,
  PurchaseOrderStatus,
  PurchaseRequisitionReason,
} from "../types/purchasing.dto";
import {
  formatCents,
  lineTotalCents,
  moneyToCents,
  sumCents,
} from "../utils/money.util";
import { CancelPurchaseOrderBalanceForm } from "./cancel-purchase-order-balance-form";
import { PurchaseOrderReviewActions } from "./purchase-order-review-actions";

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

const requestReasonLabels: Record<PurchaseRequisitionReason, string> = {
  shortage: "Shortage",
  reorder: "Reorder",
};

const changeLabels: Record<PurchaseOrderSnapshotLineChange["change"], string> =
  {
    added: "Added",
    removed: "Removed",
    changed: "Changed",
  };

const nextStepMessages: Record<PurchaseOrderStatus, string> = {
  pending_approval: "",
  for_revision:
    "Returned for revision. Purchasing Staff must submit a new version for review.",
  approved:
    "Approved for the current version. Purchasing Staff can place the order.",
  placed: "Placed with the supplier. This PO is in the receiving handoff.",
  partially_received:
    "Partially received. Accepted quantities are recorded against this PO.",
  closed: "Closed. Every line is fully received or cancelled.",
  cancelled: "Cancelled. No further placement or receiving is allowed.",
};

function formatDate(value: Date | null): string {
  return value ? dateFormat.format(value) : "—";
}

function formatMoney(value: string | null): string {
  return value === null ? "—" : formatCents(moneyToCents(value));
}

function formatText(value: string | null): string {
  return value === null || value.trim().length === 0 ? "—" : value;
}

/** Accounting's view of one PO, with the actions available to that role. */
export function PurchaseOrderReviewDetail({
  context,
  canReview,
  canCancel,
}: {
  context: PurchaseOrderReviewContextDto;
  canReview: boolean;
  canCancel: boolean;
}) {
  const {
    order,
    supplier,
    sourcePurchaseRequisition,
    versionDiff,
    snapshotUnavailable,
  } = context;
  const totalCents = sumCents(
    order.lines.map((line) => lineTotalCents(line.orderedQty, line.unitPrice)),
  );
  const previousVersion = order.currentVersion - 1;
  const cancellableLines = order.lines
    .filter((line) => compareQuantities(line.outstandingQty, "0") > 0)
    .map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      remainingQty: formatQuantity(line.outstandingQty),
    }));
  const canCancelBalance =
    canCancel &&
    order.cancelledAt === null &&
    cancellableLines.length > 0 &&
    (order.status === "approved" ||
      order.status === "placed" ||
      order.status === "partially_received");

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-1">
            <StatusBadge tone={statusTones[order.status]}>
              {statusLabels[order.status]}
            </StatusBadge>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Version</p>
          <p className="mt-1 font-medium tabular-nums">
            {order.currentVersion}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Prepared by</p>
          <p className="mt-1 font-medium">{order.preparedByName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Supplier</p>
          <p className="mt-1 font-medium">
            {supplier?.supplierName ?? order.supplierName}
          </p>
          {supplier?.contactPerson && (
            <p className="text-xs text-muted-foreground">
              {supplier.contactPerson}
            </p>
          )}
          {supplier?.contactDetails && (
            <p className="text-xs text-muted-foreground">
              {supplier.contactDetails}
            </p>
          )}
          {supplier?.address && (
            <p className="text-xs text-muted-foreground">{supplier.address}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Approved by</p>
          <p className="mt-1 font-medium">{order.approvedByName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Approved at</p>
          <p className="mt-1 font-medium">{formatDate(order.approvedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ordered at</p>
          <p className="mt-1 font-medium">{formatDate(order.orderedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Delivery terms</p>
          <p className="mt-1 text-sm">{formatText(order.deliveryTerms)}</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Source purchase request</h2>
        {sourcePurchaseRequisition ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">PR number</p>
              <p className="mt-1 font-medium">
                #{sourcePurchaseRequisition.purchaseRequisitionId}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requested by</p>
              <p className="mt-1 font-medium">
                {sourcePurchaseRequisition.requestedByName}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reason</p>
              <p className="mt-1 font-medium">
                {requestReasonLabels[sourcePurchaseRequisition.requestReason]}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requested at</p>
              <p className="mt-1 font-medium">
                {formatDate(sourcePurchaseRequisition.requestedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PR status</p>
              <p className="mt-1 font-medium capitalize">
                {sourcePurchaseRequisition.status}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This purchase order has no linked purchase request.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3 font-medium">Item</th>
                <th className="p-3 text-right font-medium">Ordered</th>
                <th className="p-3 text-right font-medium">Cancelled</th>
                <th className="p-3 text-right font-medium">Accepted</th>
                <th className="p-3 text-right font-medium">Outstanding</th>
                <th className="p-3 text-right font-medium">Unit price</th>
                <th className="p-3 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.lines.map((line) => (
                <tr key={line.purchaseOrderLineId}>
                  <td className="p-3">
                    <span className="font-medium">{line.itemCode}</span>{" "}
                    {line.itemName}{" "}
                    <span className="text-muted-foreground">({line.unit})</span>
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
                    {formatCents(moneyToCents(line.unitPrice))}
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">
                    {formatCents(
                      lineTotalCents(line.orderedQty, line.unitPrice),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="p-3 text-right font-medium" colSpan={6}>
                  PO total
                </td>
                <td className="p-3 text-right font-semibold tabular-nums">
                  {formatCents(totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {order.currentVersion > 1
            ? `What changed since version ${previousVersion}`
            : "Version comparison"}
        </h2>
        {snapshotUnavailable ? (
          <p className="text-sm text-muted-foreground">
            The current version snapshot could not be read, so the comparison is
            unavailable.
          </p>
        ) : order.currentVersion <= 1 ? (
          <p className="text-sm text-muted-foreground">
            This is the first version of the purchase order.
          </p>
        ) : versionDiff === null ? (
          <p className="text-sm text-muted-foreground">
            The previous version snapshot could not be read.
          </p>
        ) : !versionDiff.hasChanges ? (
          <p className="text-sm text-muted-foreground">
            No changes to the supplier, delivery terms, quantities, or prices.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {(versionDiff.supplierChanged ||
              versionDiff.deliveryTermsChanged) && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {versionDiff.supplierChanged && (
                  <li>
                    Supplier:{" "}
                    <span className="font-medium">
                      {versionDiff.previousSupplierName}
                    </span>{" "}
                    →{" "}
                    <span className="font-medium">
                      {versionDiff.supplierName}
                    </span>
                  </li>
                )}
                {versionDiff.deliveryTermsChanged && (
                  <li>
                    Delivery terms:{" "}
                    <span className="font-medium">
                      {formatText(versionDiff.previousDeliveryTerms)}
                    </span>{" "}
                    →{" "}
                    <span className="font-medium">
                      {formatText(versionDiff.deliveryTerms)}
                    </span>
                  </li>
                )}
              </ul>
            )}

            {versionDiff.lineChanges.length > 0 && (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="p-3 font-medium">Change</th>
                      <th className="p-3 font-medium">Item</th>
                      <th className="p-3 text-right font-medium">
                        Previous qty
                      </th>
                      <th className="p-3 text-right font-medium">New qty</th>
                      <th className="p-3 text-right font-medium">
                        Previous price
                      </th>
                      <th className="p-3 text-right font-medium">New price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {versionDiff.lineChanges.map((change) => (
                      <tr key={change.purchaseRequisitionLineId}>
                        <td className="p-3">{changeLabels[change.change]}</td>
                        <td className="p-3">
                          <span className="font-medium">{change.itemCode}</span>{" "}
                          {change.itemName}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {change.previousOrderedQty === null
                            ? "—"
                            : formatQuantity(change.previousOrderedQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {change.orderedQty === null
                            ? "—"
                            : formatQuantity(change.orderedQty)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatMoney(change.previousUnitPrice)}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {formatMoney(change.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {order.cancelledAt && (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Cancelled balance</h2>
          <p className="mt-2 text-sm">
            Cancelled by{" "}
            <span className="font-medium">{order.cancelledByName ?? "—"}</span>{" "}
            on {formatDate(order.cancelledAt)}.
          </p>
          {order.cancellationReason && (
            <p className="mt-1 text-sm text-muted-foreground">
              Reason: {order.cancellationReason}
            </p>
          )}
        </section>
      )}

      {order.status === "pending_approval" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Accounting decision</h2>
          {canReview ? (
            <>
              <p className="text-sm text-muted-foreground">
                Review the current version and record a budget reason. Approval
                authorizes this exact version only.
              </p>
              <div className="rounded-lg border bg-card p-4 sm:p-5">
                <PurchaseOrderReviewActions
                  purchaseOrderId={order.purchaseOrderId}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only the Accounting Associate can decide this purchase order.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Accounting decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {nextStepMessages[order.status]}
          </p>
        </section>
      )}

      {canCancelBalance && (
        <CancelPurchaseOrderBalanceForm
          purchaseOrderId={order.purchaseOrderId}
          lines={cancellableLines}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Version history</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3 font-medium">Version</th>
                <th className="p-3 font-medium">Changed by</th>
                <th className="p-3 font-medium">Review</th>
                <th className="p-3 font-medium">Reviewed by</th>
                <th className="p-3 font-medium">Budget note / reason</th>
                <th className="p-3 font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.revisions.map((revision) => (
                <tr key={revision.revisionId}>
                  <td className="p-3 font-medium tabular-nums">
                    {revision.versionNo}
                  </td>
                  <td className="p-3">{revision.changedByName}</td>
                  <td className="p-3">
                    {revision.budgetOk === null
                      ? "Pending"
                      : revision.budgetOk
                        ? "Approved"
                        : "Returned"}
                  </td>
                  <td className="p-3">{revision.reviewedByName ?? "—"}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {revision.reviewReason ?? "—"}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {formatDate(revision.reviewedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
