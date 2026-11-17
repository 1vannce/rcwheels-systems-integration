"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { resolveDiscrepancyAction } from "../actions/internal-delivery.actions";

/**
 * The approver's decision on one RDR: send a replacement, or cancel the
 * rejected quantity so the request can close without it.
 */
export function ResolveDiscrepancyForm({
  internalDiscrepancyId,
  requisitionId,
  quantityLabel,
}: {
  internalDiscrepancyId: number;
  requisitionId: number;
  quantityLabel: string;
}) {
  const [result, formAction] = useActionState(resolveDiscrepancyAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-t pt-3">
      <input type="hidden" name="internalDiscrepancyId" value={internalDiscrepancyId} />
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <label className="flex flex-col gap-1 text-sm">
        <span>Reason for your decision</span>
        <Input name="note" required minLength={3} maxLength={300} />
      </label>
      <FormMessage result={result} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="replace">
          Approve replacement of {quantityLabel}
        </SubmitButton>
        <SubmitButton name="decision" value="cancel" variant="outline">
          Cancel {quantityLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
