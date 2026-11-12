import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listReadyForArPreparationService as listReadyForArPreparation } from "@/modules/requisition";
import { ArPreparationQueue } from "@/modules/requisition/components/ar-preparation-queue";

export const metadata: Metadata = { title: "AR preparation | RCWheels" };

export default async function ArPreparationPage() {
  await requireScreen("inventory-ar-preparation");
  const requisitions = await listReadyForArPreparation();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">AR preparation</h1>
        <p className="text-sm text-muted-foreground">
          Reserved requests that are ready for a dispatch and acknowledgement
          receipt.
        </p>
      </div>
      <ArPreparationQueue requisitions={requisitions} />
    </>
  );
}
