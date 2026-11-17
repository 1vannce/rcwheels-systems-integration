import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listReturnLinesToInspect, listReturnsToReceive } from "@/modules/delivery";
import {
  ReturnsToInspectTable,
  ReturnsToReceiveTable,
} from "@/modules/delivery/components/return-tables";

export const metadata: Metadata = { title: "Return inspection | RCWheels" };

export default async function ReturnInspectionPage() {
  const user = await requireScreen("delivery-return-inspection");
  const [toReceive, toInspect] = await Promise.all([
    listReturnsToReceive(),
    listReturnLinesToInspect(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Return inspection</h1>
        <p className="text-sm text-muted-foreground">
          Receive rejected items into held stock, then inspect them as usable, damaged, or
          uncertain.
        </p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">To receive</h2>
        <ReturnsToReceiveTable
          reports={toReceive}
          canReceive={user.role === "inventory_custodian" || user.role === "delivery_operations"}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">To inspect</h2>
        <ReturnsToInspectTable
          lines={toInspect}
          canInspect={user.role === "inventory_custodian"}
        />
      </section>
    </>
  );
}
