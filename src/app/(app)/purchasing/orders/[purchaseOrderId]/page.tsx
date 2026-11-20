import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageHeader from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireScreen, requireUser } from "@/modules/core";
import {
  formatPoNumber,
  getPurchaseOrderEditContextService,
  type PurchaseOrderStatus,
} from "@/modules/purchasing";
import { EditPurchaseOrderForm } from "@/modules/purchasing/components/edit-purchase-order-form";
import { DiscardPurchaseOrderDraftButton } from "@/modules/purchasing/components/discard-purchase-order-draft-button";
import { PlacePurchaseOrderButton } from "@/modules/purchasing/components/place-purchase-order-button";

export const metadata: Metadata = { title: "Purchase order" };

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

export default async function PurchaseOrderDetailPage({
  params,
}: PageProps<"/purchasing/orders/[purchaseOrderId]">) {
  await requireScreen("purchasing-po-editor");
  const user = await requireUser();
  const purchaseOrderId = Number((await params).purchaseOrderId);

  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    notFound();
  }

  const context = await getPurchaseOrderEditContextService(user, purchaseOrderId);

  if (!context) {
    notFound();
  }

  const { order } = context;
  const sourcePr =
    order.lines.find((line) => line.purchaseRequisitionId !== null)
      ?.purchaseRequisitionId ?? null;

  return (
    <>
      <PageHeader
        title={formatPoNumber(order.purchaseOrderId)}
        description={`${order.supplierName} · prepared by ${order.preparedByName}`}
      />

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
          <p className="mt-1 font-medium tabular-nums">{order.currentVersion}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Source PR</p>
          <p className="mt-1 font-medium">{sourcePr === null ? "—" : `#${sourcePr}`}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Delivery terms</p>
          <p className="mt-1 text-sm">{order.deliveryTerms ?? "—"}</p>
        </div>
      </section>

      {context.canDiscard && (
        <DiscardPurchaseOrderDraftButton purchaseOrderId={order.purchaseOrderId} />
      )}

      {context.canPlace && (
        <PlacePurchaseOrderButton purchaseOrderId={order.purchaseOrderId} />
      )}

      {context.canEdit ? (
        <EditPurchaseOrderForm context={context} />
      ) : (
        !context.canPlace && (
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-semibold">This purchase order cannot be revised</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only a PO returned for revision or an approved PO that has not been placed
              can be changed here.
            </p>
          </section>
        )
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
                <th className="p-3 font-medium">Reason</th>
                <th className="p-3 font-medium">Reviewed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.revisions.map((revision) => (
                <tr key={revision.revisionId}>
                  <td className="p-3 font-medium tabular-nums">{revision.versionNo}</td>
                  <td className="p-3">{revision.changedByName}</td>
                  <td className="p-3">
                    {revision.budgetOk === null
                      ? "Pending"
                      : revision.budgetOk
                        ? "Approved"
                        : "Returned"}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {revision.reviewReason ?? "—"}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {revision.reviewedAt ? dateFormat.format(revision.reviewedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
