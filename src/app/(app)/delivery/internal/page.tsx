import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listInternalDeliveryQueue } from "@/modules/delivery";
import { DeliveryQueueTable } from "@/modules/delivery/components/delivery-queue-table";

export const metadata: Metadata = { title: "Internal delivery | RCWheels" };

export default async function InternalDeliveryPage() {
  await requireScreen("delivery-internal-delivery-queue");
  const deliveries = await listInternalDeliveryQueue();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Internal delivery queue</h1>
        <p className="text-sm text-muted-foreground">
          Dispatched items to bring to each requester. A delivery leaves this list once the
          requester signs its acknowledgement receipt.
        </p>
      </div>
      <DeliveryQueueTable
        deliveries={deliveries}
        emptyMessage="Nothing is out for delivery. Dispatched requests appear here."
      />
    </>
  );
}
