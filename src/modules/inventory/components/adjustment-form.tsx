"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { requestAdjustmentAction } from "../actions/adjustment.actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AdjustmentForm({
  items,
}: {
  items: { itemId: number; itemCode: string; itemName: string }[];
}) {
  const [result, formAction] = useActionState(requestAdjustmentAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Record a physical count</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemId">Item</Label>
          <select id="itemId" name="itemId" required className={selectClass}>
            {items.map((item) => (
              <option key={item.itemId} value={item.itemId}>
                {item.itemCode} · {item.itemName}
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
