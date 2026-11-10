import type { Metadata } from "next";

import { requireScreen } from "@/modules/core";
import {
  formatQuantity,
  listItemsWithStock,
  listSalesDeductions,
  todayInManila,
} from "@/modules/inventory";
import { SalesDeductionForm } from "@/modules/inventory/components/sales-deduction-form";
import { SalesDeductionTable } from "@/modules/inventory/components/sales-deduction-table";

export const metadata: Metadata = { title: "Sales deductions | RCWheels" };

export default async function SalesDeductionsPage() {
  await requireScreen("inventory-sales-deductions");

  const [deductions, items] = await Promise.all([
    listSalesDeductions(),
    listItemsWithStock(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Sales deductions</h1>
        <p className="text-sm text-muted-foreground">
          Deduct sold stock against its sales record. Only available stock can be deducted;
          stock reserved for requests cannot.
        </p>
      </div>
      <SalesDeductionForm
        today={todayInManila()}
        items={items.map((item) => ({
          itemId: item.itemId,
          itemCode: item.itemCode,
          itemName: item.itemName,
          available: formatQuantity(item.available),
        }))}
      />
      <SalesDeductionTable deductions={deductions} />
    </>
  );
}
