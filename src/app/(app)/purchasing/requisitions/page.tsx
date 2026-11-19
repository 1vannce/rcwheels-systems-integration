import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { PurchaseRequisitionQueue } from "@/modules/purchasing/components/purchase-requisition-queue";
import { listOpenPurchaseRequisitionsService } from "@/modules/purchasing";

export const metadata: Metadata = { title: "Purchase requests" };

export default async function PurchaseRequisitionsPage() {
  await requireScreen("purchasing-pr-queue");
  const requests = await listOpenPurchaseRequisitionsService();

  return (
    <>
      <PageHeader
        title="Purchase requests"
        description="Shortages raised by Inventory and waiting for a purchase order. A PR does not authorize spending; Accounting approves the PO separately."
      />
      <PurchaseRequisitionQueue requests={requests} />
    </>
  );
}
