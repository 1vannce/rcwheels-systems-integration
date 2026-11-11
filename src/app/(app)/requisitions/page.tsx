import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listMyRequisitions } from "@/modules/requisition";
import { RequisitionTable } from "@/modules/requisition/components/requisition-table";

export const metadata: Metadata = { title: "My requests | RCWheels" };

export default async function MyRequisitionsPage() {
  const user = await requireScreen("requisition-my-requests");
  const requisitions = await listMyRequisitions(user);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">My requests</h1>
        <p className="text-sm text-muted-foreground">
          Track the status, requested items, and delivery details for your requisitions.
        </p>
      </div>
      <RequisitionTable requisitions={requisitions} />
    </div>
  );
}
