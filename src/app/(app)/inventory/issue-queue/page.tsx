import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listApprovedForIssueService as listApprovedForIssue } from "@/modules/requisition";
import { IssueQueue } from "@/modules/requisition/components/issue-queue";

export const metadata: Metadata = { title: "Issue queue | RCWheels" };

export default async function IssueQueuePage() {
  await requireScreen("inventory-issue-queue");
  const requisitions = await listApprovedForIssue();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Issue queue</h1>
        <p className="text-sm text-muted-foreground">
          Approved requests waiting for a stock check and reservation.
        </p>
      </div>
      <IssueQueue requisitions={requisitions} />
    </>
  );
}
