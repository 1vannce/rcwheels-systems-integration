import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Material Requisitions</h1>
        <p className="text-sm text-muted-foreground">
          Digital Requisition Forms with live status and stock allocation.
        </p>
      </div>
      <MyRequestsView requisitions={requisitions} />
    </>
  );
}
