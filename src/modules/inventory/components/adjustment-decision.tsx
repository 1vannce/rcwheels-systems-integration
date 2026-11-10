"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { decideAdjustmentAction } from "../actions/adjustment.actions";

export function AdjustmentDecision({ adjustmentId }: { adjustmentId: number }) {
  const [result, formAction] = useActionState(decideAdjustmentAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm">
          Approve
        </SubmitButton>
        <Input
          name="reason"
          aria-label="Reason for rejecting"
          placeholder="Reason, if rejecting"
          maxLength={300}
          className="h-7 min-w-40"
        />
        <SubmitButton name="decision" value="reject" size="sm" variant="outline">
          Reject
        </SubmitButton>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
