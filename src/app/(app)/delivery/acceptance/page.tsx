import type { Metadata } from "next";

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Acceptance and AR signing</h1>
        <p className="text-sm text-muted-foreground">
          {canSign
            ? "Check the items you received, accept what is right, and sign the acknowledgement receipt."
            : "Deliveries waiting for the requester to accept and sign the acknowledgement receipt."}
        </p>
      </div>
      {canSign ? (
        deliveries.length === 0 ? (
          <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No deliveries are waiting for you. Items on their way to you appear here once
            dispatched.
          </p>
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
