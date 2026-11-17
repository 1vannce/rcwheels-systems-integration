import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listCompletedRequisitionsService as listCompletedRequisitions } from "@/modules/requisition";
import { AllRequisitions } from "@/modules/requisition/components/all-requisitions";

export const metadata: Metadata = { title: "Completed requests" };

export default async function CompletedRequisitionsPage() {
  await requireScreen("requisition-completed");
  const requisitions = await listCompletedRequisitions();

  return (
    <>
      <PageHeader
        title="Completed requests"
        description="Requests that are fulfilled, cancelled, or rejected. Open one to see its full history."
      />
      <AllRequisitions requisitions={requisitions} mode="completed" />
    </>
  );
}
