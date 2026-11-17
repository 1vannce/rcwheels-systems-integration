import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listDiscrepancies } from "@/modules/delivery";
import { DiscrepancyTable } from "@/modules/delivery/components/discrepancy-table";

export const metadata: Metadata = { title: "Requester discrepancies | RCWheels" };

export default async function DiscrepancyReportsPage() {
  const user = await requireScreen("delivery-rdr");
  const discrepancies = await listDiscrepancies(user);
  const canResolve = user.role === "requisition_approver";

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Requester discrepancies</h1>
        <p className="text-sm text-muted-foreground">
          {canResolve
            ? "Items requesters rejected on delivery. Approve a replacement or cancel the quantity."
            : "Items rejected on delivery and what was decided about them."}
        </p>
      </div>
      <DiscrepancyTable discrepancies={discrepancies} canResolve={canResolve} />
    </>
  );
}
