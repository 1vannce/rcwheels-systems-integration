"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

import { markRequisitionFulfilledAction } from "../actions/action.mark-requisition-fulfilled";

/**
 * The assigned approver closes a Delivered request. The server checks again
 * that every approved quantity is accepted or cancelled.
 */
export function FulfilButton({ requisitionId }: { requisitionId: number }) {
  const [result, formAction] = useActionState(markRequisitionFulfilledAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Close the request</h2>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <p className="text-sm text-muted-foreground">
        Every approved item is accepted by the requester or cancelled. Marking the request
        Fulfilled closes it.
      </p>
      <FormMessage result={result} />
      <div>
        <SubmitButton>Mark fulfilled</SubmitButton>
      </div>
    </form>
  );
}
