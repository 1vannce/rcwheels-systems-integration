import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import {
  listPendingApprovalsService as listPendingApprovals,
} from "@/modules/requisition";
import { ApprovalQueue } from "@/modules/requisition/components/approval-queue";

export const metadata: Metadata = { title: "Approval queue | RCWheels" };

export default async function ApprovalQueuePage() {
  const user = await requireScreen("requisition-approval-queue");
  const requisitions = await listPendingApprovals(user);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Requisition Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Urgent requests are ranked first. Approval never authorizes a
          purchase — that stays with Accounting.
        </p>
      </div>
      <ApprovalQueue requisitions={requisitions} />
    </>
  );
}
