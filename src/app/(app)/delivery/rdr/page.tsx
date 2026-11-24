import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listDiscrepancies } from "@/modules/delivery";
import { DiscrepancyTable } from "@/modules/delivery/components/discrepancy-table";

export const metadata: Metadata = { title: "Requester discrepancies" };

export default async function DiscrepancyReportsPage() {
  const user = await requireScreen("delivery-rdr");
  const discrepancies = await listDiscrepancies(user);
  const canResolve = user.role === "requisition_approver";

  return (
    <>
      <PageHeader
        title="Requester discrepancies"
        description={canResolve
            ? "Items requesters rejected on delivery. Approve a replacement or cancel the quantity."
            : "Items rejected on delivery and what was decided about them."}
      />
      <DiscrepancyTable discrepancies={discrepancies} canResolve={canResolve} />
    </>
  );
}
