import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import { listItemsWithStock } from "@/modules/inventory";
import { ItemForm } from "@/modules/inventory/components/item-form";
import { ItemTable } from "@/modules/inventory/components/item-table";

export const metadata: Metadata = { title: "Items | RCWheels" };

export default async function ItemsPage() {
  await requireScreen("inventory-item-list");

  const items = await listItemsWithStock();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Items</h1>
        <p className="text-sm text-muted-foreground">
          Available = usable on hand minus stock reserved for requests.
        </p>
      </div>
      <ItemTable items={items} />
      <ItemForm />
    </>
  );
}
