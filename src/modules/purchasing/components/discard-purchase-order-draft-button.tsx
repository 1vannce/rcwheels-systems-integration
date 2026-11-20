"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

import { discardPurchaseOrderDraftAction } from "../actions/action.discard-purchase-order-draft";

/**
 * Withdraws a PO draft before Accounting approves it. The quantity returns to
 * the source PR, where it can be ordered again.
 */
export function DiscardPurchaseOrderDraftButton({
  purchaseOrderId,
}: {
  purchaseOrderId: number;
}) {
  const [result, formAction] = useActionState(
    discardPurchaseOrderDraftAction,
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-dashed bg-card p-4 sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Discard this draft</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Discarding cancels the PO before Accounting approves it and releases its
          quantity back to the purchase request. Earlier versions stay in the history.
        </p>
      </div>
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <FormMessage result={result} />
      <div>
        <SubmitButton variant="outline">Discard draft</SubmitButton>
      </div>
    </form>
  );
}
