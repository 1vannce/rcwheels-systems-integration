import PageHeader from "@/components/page-header";
import { notFound } from "next/navigation";

import { requireScreen } from "@/modules/core";
import { getItemStockDetail } from "@/modules/inventory";
import { ReorderPointForm } from "@/modules/inventory/components/reorder-point-form";
import { StockDetail } from "@/modules/inventory/components/stock-detail";

export default async function ItemStockPage({
  params,
}: PageProps<"/inventory/items/[itemId]">) {
  const user = await requireScreen("inventory-stock-detail-and-movements");
  const itemId = Number((await params).itemId);
  const detail = Number.isInteger(itemId) ? await getItemStockDetail(itemId) : null;

  if (!detail) {
    notFound();
  }

  return (
    <>
      <PageHeader
        back={{ href: "/inventory/items", label: "Back to items" }}
        title={detail.item.itemName}
        badges={
          <span className="rounded-sm border bg-card px-2 py-0.5 text-sm font-medium">
            <span className="sr-only">Item code </span>
            {detail.item.itemCode}
          </span>
        }
      />
      <StockDetail item={detail.item} movements={detail.movements} />
      {user.role === "inventory_manager" && (
        <ReorderPointForm
          itemId={detail.item.itemId}
          reorderPoint={detail.item.reorderPoint}
        />
      )}
    </>
  );
}
