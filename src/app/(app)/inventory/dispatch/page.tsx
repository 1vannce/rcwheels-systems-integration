import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listReadyForDispatchService as listReadyForDispatch } from "@/modules/requisition";
import { DispatchQueue } from "@/modules/requisition/components/dispatch-queue";

export const metadata: Metadata = { title: "Dispatch | RCWheels" };

export default async function DispatchPage() {
  await requireScreen("inventory-dispatch");
  const requisitions = await listReadyForDispatch();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dispatch</h1>
        <p className="text-sm text-muted-foreground">
          Requests with a prepared acknowledgement receipt, waiting to be
          released.
        </p>
      </div>
      <DispatchQueue requisitions={requisitions} />
    </>
  );
}
