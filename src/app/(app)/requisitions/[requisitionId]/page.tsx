import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/modules/core";
import { compareQuantities, listItemsWithStock, todayInManila } from "@/modules/inventory";
import {
  getRequisitionDetailService as getRequisitionDetail,
  listActiveMechanicsService,
} from "@/modules/requisition";
import { ApprovalDecision } from "@/modules/requisition/components/approval-decision";
import { formatRfNumber } from "@/modules/requisition/utils/rf-number.util";
import { ArPreparationForm } from "@/modules/requisition/components/ar-preparation-form";
import { DispatchButton } from "@/modules/requisition/components/dispatch-button";
import { RequisitionDetails } from "@/modules/requisition/components/requisition-details";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";
import { ReserveForm } from "@/modules/requisition/components/reserve-form";

export const metadata: Metadata = { title: "Request | RCWheels" };

export default async function RequisitionDetailPage({
  params,
}: PageProps<"/requisitions/[requisitionId]">) {
  // Any signed-in user may open the route; record access is decided by
  // getRequisitionDetail so the approver's queue can link into the same page.
  const user = await requireUser();
  const requisitionId = Number((await params).requisitionId);

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

  const backHref = isApprover
    ? "/requisitions/approvals"
    : user.role === "inventory_custodian" || user.role === "inventory_manager"
      ? detail.requisition.status === "for_delivery"
        ? "/inventory/dispatch"
        : "/inventory/issue-queue"
      : "/requisitions/my-requests";
  const backLabel = isApprover
    ? "Back to approval queue"
    : user.role === "inventory_custodian" || user.role === "inventory_manager"
      ? detail.requisition.status === "for_delivery"
        ? "Back to dispatch"
        : "Back to issue queue"
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

  const canPrepareAr =
    isCustodian &&
    (detail.requisition.status === "approved" || detail.requisition.status === "awaiting_stock") &&
    detail.lines.some((line) => compareQuantities(line.reservedQty, "0") > 0);

  const canDispatch = isCustodian && detail.requisition.status === "for_delivery";

  const arLines = detail.lines.map((line) => ({
    requisitionLineId: line.requisitionLineId,
    itemCode: line.itemCode,
    itemName: line.itemName,
    unit: line.unit,
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
      {canReserve && (
        <ReserveForm requisitionId={detail.requisition.requisitionId} lines={reserveLines} />
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
