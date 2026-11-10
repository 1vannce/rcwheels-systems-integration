"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { createItemAction } from "../actions/item.actions";

export function ItemForm() {
  const [result, formAction] = useActionState(createItemAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Add an item</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemCode">Code</Label>
          <Input id="itemCode" name="itemCode" required maxLength={30} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="itemName">Name</Label>
          <Input id="itemName" name="itemName" required maxLength={120} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="specification">Specification</Label>
          <Input id="specification" name="specification" required maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" name="unit" required maxLength={20} placeholder="pc" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reorderPoint">Reorder point</Label>
          <Input id="reorderPoint" name="reorderPoint" required inputMode="decimal" defaultValue="0" />
        </div>
      </div>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Add item</SubmitButton>
      </div>
    </form>
  );
}
