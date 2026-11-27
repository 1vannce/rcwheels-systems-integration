import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { ReceiveDeliveryForm } from "@/modules/delivery/components/receive-delivery-form";
import { compareQuantities } from "@/modules/inventory";
import { formatPoNumber, listPurchaseOrdersForReceivingService } from "@/modules/purchasing";

export const metadata: Metadata = { title: "Receive delivery" };

export default async function ReceiveDeliveryPage({
  params,
}: PageProps<"/delivery/receiving/[purchaseOrderId]">) {
  const user = await requireScreen("delivery-receipt-inspection");

  // Inspection is the Custodian's alone (BR-SR-03). The administrator can open
  // every screen, so it is turned away here.
  if (user.role !== "inventory_custodian") {
    redirect("/forbidden");
  }

  const purchaseOrderId = Number((await params).purchaseOrderId);

  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    notFound();
  }

  // A PO leaves the queue when it closes. No 404 then, because this page
  // re-renders right after the delivery that closed it.
  const order = (await listPurchaseOrdersForReceivingService(user)).find(
    (candidate) => candidate.purchaseOrderId === purchaseOrderId,
  );
  const lines =
    order?.lines.filter((line) => compareQuantities(line.outstandingQty, "0") > 0) ?? [];

  return (
    <>
      <PageHeader
        title={`Receive ${formatPoNumber(purchaseOrderId)}`}
        description={order?.supplierName}
      />
      <p>
        <Link href="/delivery/receiving" className="text-sm underline underline-offset-4">
          Back to the receiving queue
        </Link>
      </p>
      <ReceiveDeliveryForm purchaseOrderId={purchaseOrderId} lines={lines} />
    </>
  );
}
