import type { Metadata } from "next";
import Link from "next/link";

import { requireScreen } from "@/modules/core";
import PageHeader from "@/components/page-header";
import { listMyRequestsService as listMyRequests } from "@/modules/requisition";
import { RequisitionTable } from "@/modules/requisition/components/requisition-table";

export const metadata: Metadata = { title: "My requests | RCWheels" };

export default async function MyRequestsPage() {
  const user = await requireScreen("requisition-my-requests");
  const requisitions = await listMyRequests(user);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="My Requests"
          description="Requests you submitted or that were filed for your mechanic account, urgent first and then newest first."
        ></PageHeader>
        <Link
          href="/requisitions/new"
          className="text-sm underline underline-offset-4"
        >
          New requisition
        </Link>
      </div>
      <RequisitionTable requisitions={requisitions} />
    </>
  );
}
