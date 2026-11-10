import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listItemsWithStock } from "@/modules/inventory";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";

export const metadata: Metadata = { title: "New requisition | RCWheels" };

export default async function NewRequisitionPage() {
  await requireScreen("requisition-new-rf");

  const items = await listItemsWithStock();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New requisition</h1>
        <p className="text-sm text-muted-foreground">
          Your request goes to your assigned approver. Stock is reserved only after approval.
        </p>
      </div>
      <RequisitionForm
        items={items.map(({ itemId, itemCode, itemName, unit, available }) => ({
          itemId,
          itemCode,
          itemName,
          unit,
          available,
        }))}
      />
    </>
  );
}
