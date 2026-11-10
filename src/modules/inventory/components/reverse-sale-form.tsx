"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { reverseSalesDeductionAction } from "../actions/sales-deduction.actions";

export function ReverseSaleForm({ movementId }: { movementId: number }) {
  const [result, formAction] = useActionState(reverseSalesDeductionAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="movementId" value={movementId} />
      <div className="flex gap-2">
        <Input
          name="reason"
          aria-label="Reason for the reversal"
          placeholder="Reason"
          required
          maxLength={300}
          className="h-7 min-w-40"
        />
        <SubmitButton size="sm" variant="outline">
          Reverse
        </SubmitButton>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
