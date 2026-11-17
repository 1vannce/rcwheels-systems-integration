import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen, requireUser } from "@/modules/core";
import { listItemsWithStock, todayInManila } from "@/modules/inventory";
import {
  getNextRequisitionNumberService,
  listActiveMechanicsService,
} from "@/modules/requisition";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";

export const metadata: Metadata = { title: "New requisition | RCWheels" };

export default async function NewRequisitionPage() {
  await requireScreen("requisition-new-rf");
  const user = await requireUser();

  const [items, mechanics, autoRfNumber] = await Promise.all([
    listItemsWithStock(),
    listActiveMechanicsService(),
    getNextRequisitionNumberService(),
  ]);
  const minimumDeliveryDate = todayInManila();

  return (
    <>
      <PageHeader
        title="New requisition"
        description="Your request goes to your assigned approver. Stock is reserved only after it's approved."
      />
      <RequisitionForm
        autoRfNumber={autoRfNumber}
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
