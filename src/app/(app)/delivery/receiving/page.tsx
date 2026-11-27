import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { ReceivingQueueTable } from "@/modules/delivery/components/receiving-queue-table";
import { listPurchaseOrdersForReceivingService } from "@/modules/purchasing";

export const metadata: Metadata = { title: "Supplier Receiving queue" };

export default async function SupplierReceivingQueuePage() {
  const user = await requireScreen("delivery-receiving-queue");
  const orders = await listPurchaseOrdersForReceivingService(user);
  const canReceive = user.role === "inventory_custodian";

  return (
    <>
      <PageHeader
        title="Supplier Receiving queue"
        description={
          canReceive
            ? "Placed purchase orders with items still to arrive. Open one to inspect a delivery."
            : "Placed purchase orders with items still to arrive. The Inventory Custodian inspects and records each delivery."
        }
      />
      <ReceivingQueueTable orders={orders} canReceive={canReceive} />
    </>
  );
}
