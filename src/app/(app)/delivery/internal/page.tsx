import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listInternalDeliveryQueue } from "@/modules/delivery";
import { DeliveryQueueTable } from "@/modules/delivery/components/delivery-queue-table";

export const metadata: Metadata = { title: "Internal delivery | RCWheels" };

export default async function InternalDeliveryPage() {
  await requireScreen("delivery-internal-delivery-queue");
  const deliveries = await listInternalDeliveryQueue();

  return (
    <>
      <PageHeader
        title="Internal delivery queue"
        description={"Dispatched items to bring to each requester. A delivery leaves this list once the requester signs its acknowledgement receipt."}
      />
      <DeliveryQueueTable
        deliveries={deliveries}
        emptyMessage="Nothing is out for delivery. Dispatched requests appear here."
      />
    </>
  );
}
