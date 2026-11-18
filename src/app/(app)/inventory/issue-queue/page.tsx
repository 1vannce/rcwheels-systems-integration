import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listApprovedForIssueService as listApprovedForIssue } from "@/modules/requisition";
import { IssueQueue } from "@/modules/requisition/components/issue-queue";

export const metadata: Metadata = { title: "Issue queue" };

export default async function IssueQueuePage() {
  await requireScreen("inventory-issue-queue");
  const requisitions = await listApprovedForIssue();

  return (
    <>
      <PageHeader
        title="Issue queue"
        description="Approved requests waiting for a stock check. Reserve what is available, then raise a purchase request for the rest."
      />
      <IssueQueue requisitions={requisitions} />
    </>
  );
}
