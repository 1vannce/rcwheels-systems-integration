import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listCompletedRequisitionsService as listCompletedRequisitions } from "@/modules/requisition";
import { AllRequisitions } from "@/modules/requisition/components/all-requisitions";

export const metadata: Metadata = { title: "Completed requests | RCWheels" };

export default async function CompletedRequisitionsPage() {
  await requireScreen("requisition-completed");
  const requisitions = await listCompletedRequisitions();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Completed Requests</h1>
        <p className="text-sm text-muted-foreground">
          Historical view of fulfilled, cancelled, and rejected requisitions.
        </p>
      </div>
      <AllRequisitions requisitions={requisitions} mode="completed" />
    </>
  );
}
