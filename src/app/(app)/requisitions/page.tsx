import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PageHeader from "@/components/page-header";
import { requireUser, roleCanAccessScreen } from "@/modules/core";
import { listAllRequisitionsService as listAllRequisitions } from "@/modules/requisition";
import { MyRequestsView } from "@/modules/requisition/components/my-requests-view";

export const metadata: Metadata = { title: "Material Requisitions | RCWheels" };

export default async function AllRequisitionsPage() {
  const user = await requireUser();
  // Roles without the all-requisitions screen keep the old /requisitions entry point.
  if (!roleCanAccessScreen(user.role, "requisition-all")) {
    redirect("/requisitions/my-requests");
  }
  const requisitions = await listAllRequisitions();

  return (
    <>
      <PageHeader
        title="All requisitions"
        description="Every requisition form with its current status and stock allocation."
      />
      <MyRequestsView requisitions={requisitions} />
    </>
  );
}
