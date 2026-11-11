import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { getRequisitionFormData } from "@/modules/requisition";
import { RequisitionForm } from "@/modules/requisition/components/requisition-form";

export const metadata: Metadata = { title: "New requisition | RCWheels" };

export default async function NewRequisitionPage() {
  const user = await requireScreen("requisition-new-rf");
  const formData = await getRequisitionFormData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New requisition</h1>
        <p className="text-sm text-muted-foreground">
          Choose the items, quantities, and delivery details for this request.
        </p>
      </div>
      <RequisitionForm
        items={formData.items}
        requesterName={user.fullName}
        minimumDeliveryDate={formData.minimumDeliveryDate}
      />
    </div>
  );
}
