import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listAdjustments, listItemsWithStock } from "@/modules/inventory";
import { AdjustmentForm } from "@/modules/inventory/components/adjustment-form";
import { AdjustmentTable } from "@/modules/inventory/components/adjustment-table";

export const metadata: Metadata = { title: "Adjustments" };

export default async function AdjustmentsPage() {
  const user = await requireScreen("inventory-adjustments");
  const [adjustments, items] = await Promise.all([listAdjustments(), listItemsWithStock()]);

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Physical counts that differ from the system balance. Stock changes only when an Inventory Manager approves the count."
      />
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
