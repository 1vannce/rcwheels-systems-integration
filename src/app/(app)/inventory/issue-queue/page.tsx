import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listApprovedForIssueService as listApprovedForIssue } from "@/modules/requisition";
import { IssueQueue } from "@/modules/requisition/components/issue-queue";

export const metadata: Metadata = { title: "Issue queue | RCWheels" };

export default async function IssueQueuePage() {
  await requireScreen("inventory-issue-queue");
  const requisitions = await listApprovedForIssue();

  return (
    <>
      <PageHeader
        title="Issue queue"
        description="Approved requests waiting for a stock check. Open one to reserve what is available."
      />
      <IssueQueue requisitions={requisitions} />
    </>
  );
}
