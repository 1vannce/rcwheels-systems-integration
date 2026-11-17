import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listReadyForDispatchService as listReadyForDispatch } from "@/modules/requisition";
import { DispatchQueue } from "@/modules/requisition/components/dispatch-queue";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage() {
  await requireScreen("inventory-dispatch");
  const requisitions = await listReadyForDispatch();

  return (
    <>
      <PageHeader
        title="Dispatch"
        description="Requests with a prepared acknowledgement receipt. Dispatch them to deduct the stock and send them out."
      />
      <DispatchQueue requisitions={requisitions} />
    </>
  );
}
