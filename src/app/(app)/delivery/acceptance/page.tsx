import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireScreen } from "@/modules/core";
import { listDeliveriesToAccept } from "@/modules/delivery";
import { AcceptanceForm } from "@/modules/delivery/components/acceptance-form";
import { DeliveryQueueTable } from "@/modules/delivery/components/delivery-queue-table";

export const metadata: Metadata = { title: "Acceptance and AR signing | RCWheels" };

export default async function AcceptancePage() {
  const user = await requireScreen("delivery-acceptance-and-ar-signing");
  const deliveries = await listDeliveriesToAccept(user);
  const canSign = user.role === "requester";

  return (
    <>
      <PageHeader
        title="Acceptance and AR signing"
        description={
          canSign
            ? "Check the items you received, accept what is right, and sign the acknowledgement receipt."
            : "Deliveries waiting for the requester to accept and sign the acknowledgement receipt."
        }
      />
      {canSign ? (
        deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries are waiting for you"
            description="Items on their way to you appear here once the stockroom dispatches them."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {deliveries.map((delivery) => (
              <AcceptanceForm key={delivery.dispatchId} delivery={delivery} />
            ))}
          </div>
        )
      ) : (
        <DeliveryQueueTable
          deliveries={deliveries}
          emptyMessage="No deliveries are waiting for a signature."
        />
      )}
    </>
  );
}
