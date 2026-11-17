import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listReadyForArPreparationService as listReadyForArPreparation } from "@/modules/requisition";
import { ArPreparationQueue } from "@/modules/requisition/components/ar-preparation-queue";

export const metadata: Metadata = { title: "AR preparation" };

export default async function ArPreparationPage() {
  await requireScreen("inventory-ar-preparation");
  const requisitions = await listReadyForArPreparation();

  return (
    <>
      <PageHeader
        title="AR preparation"
        description="Requests with reserved stock. Prepare an acknowledgement receipt to set them For Delivery."
      />
      <ArPreparationQueue requisitions={requisitions} />
    </>
  );
}
