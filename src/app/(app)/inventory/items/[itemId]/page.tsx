import Link from "next/link";
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
      <div className="flex flex-col gap-1">
        <Link href="/inventory/items" className="text-sm underline underline-offset-4">
          Back to items
        </Link>
        <h1 className="text-2xl font-semibold">
          {detail.item.itemCode} · {detail.item.itemName}
        </h1>
      </div>
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
