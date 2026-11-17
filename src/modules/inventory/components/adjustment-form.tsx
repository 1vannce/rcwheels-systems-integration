"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { requestAdjustmentAction } from "../actions/adjustment.actions";

const selectClass = "field-control h-8";

export function AdjustmentForm({
  items,
}: {
  items: { itemId: number; itemCode: string; itemName: string }[];
}) {
  const [result, formAction] = useActionState(requestAdjustmentAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Record a physical count</h2>
        <p className="text-sm text-muted-foreground">
          Enter what you counted on the shelf. Stock changes only after an Inventory Manager
          approves the count.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">Item</Label>
          <select id="itemId" name="itemId" required className={selectClass}>
            {items.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.itemName} ({item.itemCode})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="condition">Balance</Label>
          <select id="condition" name="condition" required className={selectClass}>
            <option value="usable">Usable</option>
            <option value="hold">Held</option>
            <option value="damaged">Damaged</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="countedQty">Counted quantity</Label>
          <Input id="countedQty" name="countedQty" required inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" required maxLength={300} />
        </div>
      </div>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Submit for approval</SubmitButton>
      </div>
    </form>
  );
}
