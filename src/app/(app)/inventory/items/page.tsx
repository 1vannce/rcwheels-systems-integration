import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import { listItemsWithStock } from "@/modules/inventory";
import { ItemForm } from "@/modules/inventory/components/item-form";
import { ItemTable } from "@/modules/inventory/components/item-table";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage() {
  await requireScreen("inventory-item-list");

  const items = await listItemsWithStock();

  return (
    <>
      <PageHeader
        title="Items"
        description="Available is usable stock on hand minus stock reserved for requests. Open an item code to see its movements."
      />
      <ItemTable items={items} />
      <ItemForm />
    </>
  );
}
