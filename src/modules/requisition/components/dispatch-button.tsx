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
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Dispatch</h2>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <p className="text-sm text-muted-foreground">
        Releasing the dispatch deducts the sent quantities from stock and marks the request Out for
        Delivery.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Dispatch items</SubmitButton>
      </div>
    </form>
  );
}
