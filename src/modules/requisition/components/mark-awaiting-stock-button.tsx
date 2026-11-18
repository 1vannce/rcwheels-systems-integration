"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

import { markAwaitingStockAction } from "../actions/action.mark-awaiting-stock";

/**
 * Used when the stock check finds nothing to reserve. It records the check and
 * moves the request to Awaiting Stock so a purchase request can be raised.
 */
export function MarkAwaitingStockButton({ requisitionId }: { requisitionId: number }) {
  const [result, formAction] = useActionState(markAwaitingStockAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">No stock available</h2>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <p className="text-sm text-muted-foreground">
        Record the stock check without reserving anything. The request moves to Awaiting
        Stock, where you can raise a purchase request for the missing items.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Record stock check — no stock available</SubmitButton>
      </div>
    </form>
  );
}
