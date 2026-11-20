"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { cancelPurchaseOrderBalanceAction } from "../actions/action.cancel-purchase-order-balance";

type CancellableLine = {
  purchaseOrderLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  remainingQty: string;
};

/**
 * Accounting cancels the whole remaining balance of an approved, placed, or
 * partially received PO. Quantities are read-only; the service recomputes them.
 */
export function CancelPurchaseOrderBalanceForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: number;
  lines: CancellableLine[];
}) {
  const [result, formAction] = useActionState(
    cancelPurchaseOrderBalanceAction,
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed bg-card p-4 sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Cancel remaining balance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This cancels the whole remaining balance with the supplier. It does
          not cancel the purchase request and does not change stock. The source
          request is rechecked; if it is still short, it returns to the
          Purchasing queue for a demand review.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => (
              <tr key={line.purchaseOrderLineId}>
                <td className="p-2">
                  <span className="font-medium">{line.itemCode}</span>{" "}
                  {line.itemName}{" "}
                  <span className="text-muted-foreground">({line.unit})</span>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {line.remainingQty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`cancel-reason-${purchaseOrderId}`} className="text-xs">
          Reason
        </Label>
        <textarea
          id={`cancel-reason-${purchaseOrderId}`}
          name="reason"
          required
          minLength={3}
          maxLength={300}
          rows={2}
          className="field-control min-h-16 py-2"
          placeholder="Explain why the remaining balance is being cancelled"
        />
      </div>

      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <FormMessage result={result} />
      <div>
        <SubmitButton variant="destructive">
          Cancel remaining balance
        </SubmitButton>
      </div>
    </form>
  );
}
