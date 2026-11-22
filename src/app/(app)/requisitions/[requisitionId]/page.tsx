import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/modules/core";
import { compareQuantities, listItemsWithStock, todayInManila } from "@/modules/inventory";
import { getPurchaseRequestContextService } from "@/modules/purchasing";
import { PurchaseRequestPanel } from "@/modules/purchasing/components/purchase-request-panel";
import {
  getRequisitionDetailService as getRequisitionDetail,
  listActiveMechanicsService,
} from "@/modules/requisition";
import { ApprovalDecision } from "@/modules/requisition/components/approval-decision";
import { AR_PREPARABLE_STATUSES } from "@/modules/requisition/types/requisition.dto";
import { formatRfNumber } from "@/modules/requisition/utils/rf-number.util";
import { ArPreparationForm } from "@/modules/requisition/components/ar-preparation-form";
import { DispatchButton } from "@/modules/requisition/components/dispatch-button";
import { MarkAwaitingStockButton } from "@/modules/requisition/components/mark-awaiting-stock-button";
import { RequisitionDetails } from "@/modules/requisition/components/requisition-details";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";
import { ReserveForm } from "@/modules/requisition/components/reserve-form";

export const metadata: Metadata = { title: "Request" };

export default async function RequisitionDetailPage({
  params,
  searchParams,
}: PageProps<"/requisitions/[requisitionId]">) {
  // Any signed-in user may open the route; record access is decided by
  // getRequisitionDetail so the approver's queue can link into the same page.
  const user = await requireUser();
  const requisitionId = Number((await params).requisitionId);
  const query = (await searchParams) ?? {};
  const fromSource = Array.isArray(query.from) ? query.from[0] : query.from;

  if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
    notFound();
  }

  const detail = await getRequisitionDetail(user, requisitionId);

  // Null also covers requests the user may not see, so the page does not
  // reveal that another person's request exists.
  if (!detail) {
    notFound();
  }

  const isApprover = detail.requisition.approverId === user.userId;
  const canDecide = isApprover && detail.requisition.status === "pending_approval";
  const isSubmitter = detail.requisition.submittedBy === user.userId;
  const canResubmit = isSubmitter && detail.requisition.status === "rejected";
  const [items, mechanics] = canResubmit
    ? await Promise.all([listItemsWithStock(), listActiveMechanicsService()])
    : [null, null];
  const isCustodian = user.role === "inventory_custodian";
  const canReserve =
    isCustodian &&
    (detail.requisition.status === "approved" || detail.requisition.status === "awaiting_stock");

  const backHref =
    fromSource === "notifications"
      ? "/notifications"
      : isApprover
        ? "/requisitions/approvals"
        : isCustodian
          ? detail.requisition.status === "for_delivery"
            ? "/inventory/dispatch"
            : "/inventory/issue-queue"
          : user.role === "inventory_manager" || user.role === "system_administrator"
            ? "/requisitions"
            : "/requisitions/my-requests";
  const backLabel =
    fromSource === "notifications"
      ? "Back to notifications"
      : isApprover
        ? "Back to approval queue"
        : isCustodian
          ? detail.requisition.status === "for_delivery"
            ? "Back to dispatch"
            : "Back to issue queue"
          : user.role === "inventory_manager" || user.role === "system_administrator"
            ? "Back to all requisitions"
            : "Back to my requests";

  const reserveLines = detail.lines.map((line) => {
    const available =
      compareQuantities(line.availableStock, "0") < 0 ? "0" : line.availableStock;
    const maxQty =
      compareQuantities(line.reservableQty, available) > 0 ? available : line.reservableQty;

    return {
      requisitionLineId: line.requisitionLineId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      needQty: line.reservableQty,
      availableQty: available,
      maxQty,
    };
  });

  const nothingReservable = reserveLines.every(
    (line) => compareQuantities(line.maxQty, "0") <= 0,
  );
  const canMarkAwaitingStock =
    canReserve &&
    detail.requisition.status === "approved" &&
    nothingReservable;
  const purchaseContext =
    isCustodian && detail.requisition.status === "awaiting_stock"
      ? await getPurchaseRequestContextService(user, requisitionId)
      : null;

  const canPrepareAr =
    isCustodian &&
    (AR_PREPARABLE_STATUSES as readonly string[]).includes(detail.requisition.status) &&
    detail.lines.some((line) => compareQuantities(line.reservedQty, "0") > 0);

  const canDispatch = isCustodian && detail.requisition.status === "for_delivery";

  const arLines = detail.lines.map((line) => ({
    requisitionLineId: line.requisitionLineId,
    itemCode: line.itemCode,
    itemName: line.itemName,
    unit: line.unit,
    requestedQty: line.requestedQty,
    unissuedQty: line.unissuedQty,
    reservedQty: line.reservedQty,
    maxQty:
      compareQuantities(line.reservedQty, line.unissuedQty) > 0
        ? line.unissuedQty
        : line.reservedQty,
  }));

  const rfNumber = formatRfNumber(detail.requisition.requisitionId, detail.requisition.submittedAt);

  return (
    <>
      <RequisitionDetails detail={detail} backHref={backHref} backLabel={backLabel} />
      {canDecide && (
        <ApprovalDecision
          requisitionId={detail.requisition.requisitionId}
          lines={detail.lines.map((line) => ({
            requisitionLineId: line.requisitionLineId,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unit: line.unit,
            requestedQty: line.requestedQty,
          }))}
        />
      )}
      {canMarkAwaitingStock ? (
        <MarkAwaitingStockButton requisitionId={detail.requisition.requisitionId} />
      ) : (
        canReserve &&
        !nothingReservable && (
          <ReserveForm requisitionId={detail.requisition.requisitionId} lines={reserveLines} />
        )
      )}
      {purchaseContext && (
        <PurchaseRequestPanel
          requisitionId={detail.requisition.requisitionId}
          context={purchaseContext}
        />
      )}
      {canPrepareAr && (
        <ArPreparationForm requisitionId={detail.requisition.requisitionId} lines={arLines} />
      )}
      {canDispatch && (
        <DispatchButton requisitionId={detail.requisition.requisitionId} />
      )}
      {canResubmit && items && (
        <RequisitionForm
          autoRfNumber={rfNumber}
          currentUser={user}
          mode="resubmit"
          minimumDeliveryDate={todayInManila()}
          requisitionId={detail.requisition.requisitionId}
          submitLabel="Resubmit for approval"
          mechanics={mechanics ?? []}
          items={items.map(({ itemId, itemCode, itemName, unit, available, reorderPoint }) => ({
            itemId,
            itemCode,
            itemName,
            unit,
            available,
            reorderPoint,
          }))}
          initial={{
            requestedForUserId: detail.requisition.requestedForUserId,
            purpose: detail.requisition.purpose,
            deliveryDate: detail.requisition.deliveryDate,
            deliveryLocation: detail.requisition.deliveryLocation,
            isUrgent: detail.requisition.isUrgent,
            lines: detail.lines.map((line) => ({
              itemId: line.itemId,
              requestedQty: line.requestedQty,
            })),
          }}
        />
      )}
    </>
  );
}
