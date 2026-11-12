import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listRejectedRequisitionsService as listRejectedRequisitions } from "@/modules/requisition";
import { AllRequisitions } from "@/modules/requisition/components/all-requisitions";

export const metadata: Metadata = { title: "Rejected reviews | RCWheels" };

export default async function RejectedReviewsPage() {
  await requireScreen("requisition-rejected-reviews");
  const requisitions = await listRejectedRequisitions();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Rejected Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Requisitions rejected during approval review or awaiting discrepancy resolution.
        </p>
      </div>
      <AllRequisitions requisitions={requisitions} mode="rejected" />
    </>
  );
}
