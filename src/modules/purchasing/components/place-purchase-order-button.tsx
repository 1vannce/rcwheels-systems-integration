"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

import { placePurchaseOrderAction } from "../actions/action.place-purchase-order";

/**
 * Places an approved PO with the supplier. This records the order and creates
 * the Supplier Receiving handoff; it does not post stock.
 */
export function PlacePurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: number }) {
  const [result, formAction] = useActionState(placePurchaseOrderAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">Place this purchase order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Placing records the order date and sends the PO to Supplier Receiving. Stock
          changes only when goods are accepted on receipt, not here.
        </p>
      </div>
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <FormMessage result={result} />
      <div>
        <SubmitButton>Place purchase order</SubmitButton>
      </div>
    </form>
  );
}
