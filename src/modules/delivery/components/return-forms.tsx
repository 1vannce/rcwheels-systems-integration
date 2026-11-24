"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { inspectReturnAction, receiveReturnAction } from "../actions/internal-delivery.actions";

/** Records rejected items brought back to the stockroom; they go into held stock. */
export function ReceiveReturnForm({
  internalDiscrepancyId,
  requisitionId,
  remainingQty,
  unit,
}: {
  internalDiscrepancyId: number;
  requisitionId: number;
  remainingQty: string;
  unit: string;
}) {
  const [result, formAction] = useActionState(receiveReturnAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="internalDiscrepancyId" value={internalDiscrepancyId} />
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Returned ({unit})</span>
          <Input
            name="returnedQty"
            inputMode="decimal"
            defaultValue={remainingQty}
            className="w-28 tabular-nums"
            required
          />
        </label>
        <SubmitButton size="sm">Receive return</SubmitButton>
      </div>
      <FormMessage result={result} />
    </form>
  );
}

/**
 * The Custodian's inspection result for one returned line. Uncertain leaves
 * the items held so they can be inspected again later.
 */
export function InspectReturnForm({ returnLineId }: { returnLineId: number }) {
  const [result, formAction] = useActionState(inspectReturnAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="returnLineId" value={returnLineId} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" name="result" value="usable">
          Usable
        </SubmitButton>
        <SubmitButton size="sm" name="result" value="damaged" variant="outline">
          Damaged
        </SubmitButton>
        <SubmitButton size="sm" name="result" value="uncertain" variant="ghost">
          Uncertain
        </SubmitButton>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
