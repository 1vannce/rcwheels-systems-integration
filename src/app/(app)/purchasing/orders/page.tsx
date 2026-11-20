import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireScreen, requireUser } from "@/modules/core";
import {
  getPurchaseOrderFormContextService,
  listPurchaseOrdersService,
} from "@/modules/purchasing";
import { CreatePurchaseOrderForm } from "@/modules/purchasing/components/create-purchase-order-form";
import { PurchaseOrderList } from "@/modules/purchasing/components/purchase-order-list";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({
  searchParams,
}: PageProps<"/purchasing/orders">) {
  await requireScreen("purchasing-po-editor");
  const user = await requireUser();
  const params = await searchParams;
  const rawPrId = Array.isArray(params.purchaseRequisitionId)
    ? params.purchaseRequisitionId[0]
    : params.purchaseRequisitionId;
  const parsedPrId = rawPrId ? Number(rawPrId) : null;
  const purchaseRequisitionId =
    parsedPrId !== null && Number.isInteger(parsedPrId) && parsedPrId > 0
      ? parsedPrId
      : null;

  const [orders, context] = await Promise.all([
    listPurchaseOrdersService(user),
    purchaseRequisitionId === null
      ? Promise.resolve(null)
      : getPurchaseOrderFormContextService(user, purchaseRequisitionId),
  ]);

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Turn an open purchase request into a PO. A new PO waits for Accounting before Purchasing can place it."
      />
      {purchaseRequisitionId !== null &&
        (context ? (
          <CreatePurchaseOrderForm context={context} />
        ) : (
          <EmptyState
            title="This purchase request cannot be ordered"
            description="It may no longer exist, it may not be open, or every line is already covered by a PO."
          />
        ))}
      <PurchaseOrderList orders={orders} />
    </>
  );
}
