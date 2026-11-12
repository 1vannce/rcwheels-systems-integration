import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import { requireScreen } from "@/modules/core";
import { Button } from "@/components/ui/button";
import { listMyRequestsService as listMyRequests } from "@/modules/requisition";
import { MyRequestsView } from "@/modules/requisition/components/my-requests-view";

export const metadata: Metadata = { title: "My Requisitions | RCWheels" };

export default async function MyRequestsPage() {
  const user = await requireScreen("requisition-my-requests");
  const requisitions = await listMyRequests(user);

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Requisitions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Digital Requisition Forms with live status and stock allocation.
          </p>
        </div>

        <Button
          size="sm"
          className="gap-2"
          render={<Link href="/requisitions/new" />}
        >
          <FileText className="h-4 w-4" />
          New Requisition Form
        </Button>
      </div>

      {/* Rich list / board view */}
      <MyRequestsView requisitions={requisitions} />
    </>
  );
}
