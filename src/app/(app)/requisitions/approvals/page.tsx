import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
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
      <PageHeader
        title="Approval queue"
        description="Requests assigned to you, urgent ones first. Approving a request never authorizes a purchase; Accounting decides that separately."
      />
      <ApprovalQueue requisitions={requisitions} />
    </>
  );
}
