import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listRejectedRequisitionsService as listRejectedRequisitions } from "@/modules/requisition";
import { AllRequisitions } from "@/modules/requisition/components/all-requisitions";

export const metadata: Metadata = { title: "Rejected reviews | RCWheels" };

export default async function RejectedReviewsPage() {
  await requireScreen("requisition-rejected-reviews");
  const requisitions = await listRejectedRequisitions();

  return (
    <>
      <PageHeader
        title="Rejected reviews"
        description="Requests rejected at approval, and delivered requests waiting for a discrepancy to be resolved."
      />
      <AllRequisitions requisitions={requisitions} mode="rejected" />
    </>
  );
}
