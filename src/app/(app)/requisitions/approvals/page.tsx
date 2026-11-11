import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { 
  listPendingApprovalsService as listPendingApprovals 
} from "@/modules/requisition";
import { ApprovalQueue } from "@/modules/requisition/components/approval-queue";

export const metadata: Metadata = { title: "Approval queue | RCWheels" };

export default async function ApprovalQueuePage() {
  const user = await requireScreen("requisition-approval-queue");
  const requisitions = await listPendingApprovals(user);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Approval queue</h1>
        <p className="text-sm text-muted-foreground">
          Requests routed to you, urgent first and then newest first. Open a request to approve
          quantities or reject it.
        </p>
      </div>
      <ApprovalQueue requisitions={requisitions} />
    </>
  );
}
