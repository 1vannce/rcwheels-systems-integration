"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { updateReorderPointAction } from "../actions/item.actions";

export function ReorderPointForm({
  itemId,
  reorderPoint,
}: {
  itemId: number;
  reorderPoint: string;
}) {
  const [result, formAction] = useActionState(updateReorderPointAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:p-5">
      <input type="hidden" name="itemId" value={itemId} />
      <Label htmlFor="reorderPoint" className="text-lg font-semibold">
        Reorder point
      </Label>
      <p className="text-sm text-muted-foreground">
        When available stock falls to this level the item is reviewed. It is not an order
        quantity.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="reorderPoint"
          name="reorderPoint"
          required
          inputMode="decimal"
          defaultValue={reorderPoint}
          className="max-w-40"
        />
        <SubmitButton>Save reorder point</SubmitButton>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
