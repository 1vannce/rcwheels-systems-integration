"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { approveRequisitionAction } from "../actions/action.approve-requisition";
import { rejectRequisitionAction } from "../actions/action.reject-requisition";

const textareaClass = "field-control min-h-16 py-1.5";

/** One line the approver decides, with the quantity they may reduce. */
export type ApprovalLine = {
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: string;
};

/** Drops trailing zeros for display without pulling server-only code into the bundle. */
function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * Approve and reject controls for a pending request.
 *
 * The approved quantity per line starts at the requested quantity and can be
 * lowered; the service re-checks every value against the stored request under
 * the header lock, so nothing here is trusted by the server (BR-AC-03).
 */
export function ApprovalDecision({
  requisitionId,
  lines,
}: {
  requisitionId: number;
  lines: ApprovalLine[];
}) {
  const [approveResult, approveAction] = useActionState(approveRequisitionAction, null);
  const [rejectResult, rejectAction] = useActionState(rejectRequisitionAction, null);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.requisitionLineId, line.requestedQty])),
  );

  const payload = lines.map((line) => ({
    requisitionLineId: line.requisitionLineId,
    approvedQty: quantities[line.requisitionLineId] ?? "",
  }));

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Your decision</h2>
        <p className="text-sm text-muted-foreground">
          Approve the quantities below, lowering any you can&apos;t justify, or reject the request with a reason.
        </p>
      </div>

      <form action={approveAction} className="flex flex-col gap-3">
        <input type="hidden" name="requisitionId" value={requisitionId} />
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-2 font-medium">Item</th>
                <th className="p-2 text-right font-medium">Requested</th>
                <th className="p-2 text-right font-medium">Approve</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => (
                <tr key={line.requisitionLineId}>
                  <td className="p-2">
                    <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                    <span className="text-muted-foreground">({line.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.requestedQty)}
                  </td>
                  <td className="w-36 p-2">
                    <Input
                      aria-label={`Approved quantity for ${line.itemName}`}
                      value={quantities[line.requisitionLineId] ?? ""}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.requisitionLineId]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      className="text-right"
                      required
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FormMessage result={approveResult} />
        <div>
          <SubmitButton>Approve request</SubmitButton>
        </div>
      </form>

      <form action={rejectAction} className="flex flex-col gap-3 border-t pt-4">
        <input type="hidden" name="requisitionId" value={requisitionId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason for rejecting</Label>
          <textarea
            id="reason"
            name="reason"
            required
            rows={2}
            maxLength={300}
            className={textareaClass}
            placeholder="What the requester needs to change"
          />
        </div>
        <FormMessage result={rejectResult} />
        <div>
          <SubmitButton variant="destructive">Reject request</SubmitButton>
        </div>
      </form>
    </div>
  );
}
