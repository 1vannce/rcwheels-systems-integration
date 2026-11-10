import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listAdjustments, listItemsWithStock } from "@/modules/inventory";
import { AdjustmentForm } from "@/modules/inventory/components/adjustment-form";
import { AdjustmentTable } from "@/modules/inventory/components/adjustment-table";

export const metadata: Metadata = { title: "Adjustments | RCWheels" };

export default async function AdjustmentsPage() {
  const user = await requireScreen("inventory-adjustments");
  const [adjustments, items] = await Promise.all([listAdjustments(), listItemsWithStock()]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Stock adjustments</h1>
        <p className="text-sm text-muted-foreground">
          The Custodian records a physical count. Stock changes only when an Inventory
          Manager approves it.
        </p>
      </div>
      {user.role === "inventory_custodian" && (
        <AdjustmentForm
          items={items.map(({ itemId, itemCode, itemName }) => ({
            itemId,
            itemCode,
            itemName,
          }))}
        />
      )}
      <AdjustmentTable
        adjustments={adjustments}
        canDecide={user.role === "inventory_manager"}
        currentUserId={user.userId}
      />
    </>
  );
}
