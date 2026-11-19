"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { createShortagePurchaseRequisitionAction } from "../actions/action.create-purchase-requisition";
import type { PurchaseRequestLineContextDto } from "../types/purchasing.dto";

/** Drops trailing zeros for display without pulling server-only code into the bundle. */
function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function isActionable(line: PurchaseRequestLineContextDto): boolean {
  return (
    Number(line.uncoveredQty) > 0 &&
    Number(line.availableQty) <= 0 &&
    line.openPurchaseRequisitionId === null
  );
}

/**
 * Raises a purchase request for the still-uncovered quantity on a request
 * awaiting stock. The Custodian sees what open POs already cover and may lower
 * a quantity, but the server never accepts more than the uncovered need.
 */
export function CreatePurchaseRequisitionForm({
  requisitionId,
  lines,
}: {
  requisitionId: number;
  lines: PurchaseRequestLineContextDto[];
}) {
  const [result, formAction] = useActionState(
    createShortagePurchaseRequisitionAction,
    null,
  );
  const actionable = lines.filter(isActionable);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(actionable.map((line) => [line.requisitionLineId, line.uncoveredQty])),
  );

  const payload = actionable
    .filter((line) => Number(quantities[line.requisitionLineId] ?? "0") > 0)
    .map((line) => ({
      requisitionLineId: line.requisitionLineId,
      requestedQty: quantities[line.requisitionLineId] ?? "",
    }));

  if (actionable.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Raise a purchase request</h2>
        <p className="text-sm text-muted-foreground">
          These items are still uncovered after the stock check. Purchasing will use this
          request to prepare a purchase order; it does not approve spending.
        </p>
      </div>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Still needed</th>
              <th className="p-2 text-right font-medium">On open PO</th>
              <th className="p-2 text-right font-medium">Uncovered</th>
              <th className="p-2 text-right font-medium">Request</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {actionable.map((line) => (
              <tr key={line.requisitionLineId}>
                <td className="p-2">
                  <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                  <span className="text-muted-foreground">({line.unit})</span>
                </td>
                <td className="p-2 text-right tabular-nums">{formatQuantity(line.needQty)}</td>
                <td className="p-2 text-right tabular-nums">
                  {formatQuantity(line.allocatedPoQty)}
                </td>
                <td className="p-2 text-right font-medium tabular-nums">
                  {formatQuantity(line.uncoveredQty)}
                </td>
                <td className="w-36 p-2 text-right">
                  <Input
                    aria-label={`Quantity to request for ${line.itemName}`}
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

      <FormMessage result={result} />
      <div>
        <SubmitButton>Create purchase request</SubmitButton>
      </div>
    </form>
  );
}
