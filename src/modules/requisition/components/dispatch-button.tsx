"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

import { dispatchRequisitionAction } from "../actions/action.dispatch-requisition";

/**
 * Releases a prepared dispatch. The server posts every dispatch line at its
 * prepared quantity, so stock is deducted exactly once; this button only
 * confirms the action.
 */
export function DispatchButton({ requisitionId }: { requisitionId: number }) {
  const [result, formAction] = useActionState(dispatchRequisitionAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Dispatch items</h2>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <p className="text-sm text-muted-foreground">
        Dispatching deducts the prepared quantities from stock and marks the request Out for
        Delivery. Do this when the items leave the stockroom.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Dispatch items</SubmitButton>
      </div>
    </form>
  );
}
