import type { Metadata } from "next";
import Link from "next/link";

import { requireScreen } from "@/modules/core";
import { listMyRequestsService as listMyRequests } from "@/modules/requisition";
import { RequisitionTable } from "@/modules/requisition/components/requisition-table";

export const metadata: Metadata = { title: "My requests | RCWheels" };

export default async function MyRequestsPage() {
  const user = await requireScreen("requisition-my-requests");
  const requisitions = await listMyRequests(user);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">My requests</h1>
          <p className="text-sm text-muted-foreground">
            Requests you submitted or that were filed for your mechanic account, urgent first and then newest first.
          </p>
        </div>
        <Link href="/requisitions/new" className="text-sm underline underline-offset-4">
          New requisition
        </Link>
      </div>
      <RequisitionTable requisitions={requisitions} />
    </>
  );
}
