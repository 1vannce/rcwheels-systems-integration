import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listAllRequisitionsService as listAllRequisitions } from "@/modules/requisition";
import { AllRequisitions } from "@/modules/requisition/components/all-requisitions";

export const metadata: Metadata = { title: "All requisitions | RCWheels" };

export default async function AllRequisitionsPage() {
  await requireScreen("requisition-all");
  const requisitions = await listAllRequisitions();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">All Requisitions</h1>
        <p className="text-sm text-muted-foreground">
          All digital requisition forms across the system with live status and stock allocation.
        </p>
      </div>
      <AllRequisitions requisitions={requisitions} mode="all" />
    </>
  );
}
