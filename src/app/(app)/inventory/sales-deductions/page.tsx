import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { requireScreen } from "@/modules/core";
import {
  formatQuantity,
  listItemsWithStock,
  listSalesDeductions,
  todayInManila,
} from "@/modules/inventory";
import { SalesDeductionForm } from "@/modules/inventory/components/sales-deduction-form";
import { SalesDeductionTable } from "@/modules/inventory/components/sales-deduction-table";

export const metadata: Metadata = { title: "Sales deductions" };

export default async function SalesDeductionsPage() {
  await requireScreen("inventory-sales-deductions");

  const [deductions, items] = await Promise.all([
    listSalesDeductions(),
    listItemsWithStock(),
  ]);

  return (
    <>
      <PageHeader
        title="Sales deductions"
        description="Deduct sold stock against its sales record. Only available stock can be deducted; stock reserved for requests cannot."
      />
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
