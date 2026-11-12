import type { Metadata } from "next";

import { requireScreen, requireUser } from "@/modules/core";
import { listItemsWithStock, todayInManila } from "@/modules/inventory";
import { listActiveMechanicsService } from "@/modules/requisition";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";

export const metadata: Metadata = { title: "New requisition | RCWheels" };

export default async function NewRequisitionPage() {
  await requireScreen("requisition-new-rf");
  const user = await requireUser();

  const [items, mechanics] = await Promise.all([
    listItemsWithStock(),
    listActiveMechanicsService(),
  ]);
  const minimumDeliveryDate = todayInManila();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New requisition</h1>
        <p className="text-sm text-muted-foreground">
          Your request goes to your assigned approver. Stock is reserved only
          after approval.
        </p>
      </div>
      <RequisitionForm
        currentUser={user}
        mechanics={mechanics}
        minimumDeliveryDate={minimumDeliveryDate}
        items={items.map(({ itemId, itemCode, itemName, unit, available, reorderPoint }) => ({
          itemId,
          itemCode,
          itemName,
          unit,
          available,
          reorderPoint,
        }))}
      />
    </>
  );
}
