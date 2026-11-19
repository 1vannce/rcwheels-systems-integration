"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { approvePurchaseOrderAction } from "../actions/action.approve-purchase-order";
import { returnPurchaseOrderAction } from "../actions/action.return-purchase-order";

/**
 * Accounting's decision on one pending PO. Approval authorizes the exact
 * current version; returning it sends the PO back to Purchasing with a reason.
 */
export function PurchaseOrderReviewActions({
  purchaseOrderId,
}: {
  purchaseOrderId: number;
}) {
  const [approveResult, approveAction] = useActionState(
    approvePurchaseOrderAction,
    null,
  );
  const [returnResult, returnAction] = useActionState(
    returnPurchaseOrderAction,
    null,
  );

  return (
    <div className="grid gap-4 border-t pt-4 lg:grid-cols-2">
      <form action={approveAction} className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Approve this version</h3>
          <p className="text-xs text-muted-foreground">
            Only the exact submitted version is approved. Placing the order is still a
            separate Purchasing step.
          </p>
        </div>
        <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
        <FormMessage result={approveResult} />
        <div>
          <SubmitButton>Approve purchase order</SubmitButton>
        </div>
      </form>

      <form action={returnAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">Return for revision</h3>
          <Label htmlFor={`reason-${purchaseOrderId}`} className="text-xs">
            Reason
          </Label>
          <textarea
            id={`reason-${purchaseOrderId}`}
            name="reason"
            required
            minLength={3}
            maxLength={300}
            rows={2}
            className="field-control min-h-16 py-2"
            placeholder="Explain why the PO is being returned"
          />
        </div>
        <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
        <FormMessage result={returnResult} />
        <div>
          <SubmitButton variant="outline">Return for revision</SubmitButton>
        </div>
      </form>
    </div>
  );
}
