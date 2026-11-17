"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { recordSalesDeductionAction } from "../actions/sales-deduction.actions";

const selectClass = "field-control h-8";

export function SalesDeductionForm({
  items,
  today,
}: {
  items: { itemId: number; itemCode: string; itemName: string; available: string }[];
  today: string;
}) {
  const [result, formAction] = useActionState(recordSalesDeductionAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Record a sales deduction</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">Item</Label>
          <select id="itemId" name="itemId" required className={selectClass}>
            {items.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.itemName} ({item.itemCode}), {item.available} available
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity">Quantity sold</Label>
          <Input id="quantity" name="quantity" required inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="salesRef">Sales record reference</Label>
          <Input id="salesRef" name="salesRef" required maxLength={40} placeholder="SI-1001" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleDate">Sale date</Label>
          <Input id="saleDate" name="saleDate" type="date" required defaultValue={today} max={today} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Each sales record line can be deducted once per item. A sale entered after its sale
        date flags the balance incomplete until a count is approved.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Deduct stock</SubmitButton>
      </div>
    </form>
  );
}
