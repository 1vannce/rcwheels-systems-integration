import type { Metadata } from "next";
import Link from "next/link";
import { FilePlusIcon } from "lucide-react";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { Button } from "@/components/ui/button";
import { listMyRequestsService as listMyRequests } from "@/modules/requisition";
import { MyRequestsView } from "@/modules/requisition/components/my-requests-view";

export const metadata: Metadata = { title: "My requests" };

export default async function MyRequestsPage() {
  const user = await requireScreen("requisition-my-requests");
  const requisitions = await listMyRequests(user);

  return (
    <>
      <PageHeader
        title="My requests"
        description="Requisition forms you submitted, with their current status and stock allocation."
        actions={
          <Button render={<Link href="/requisitions/new" />}>
            <FilePlusIcon aria-hidden="true" />
            New requisition
          </Button>
        }
      />
      <MyRequestsView requisitions={requisitions} />
    </>
  );
}
