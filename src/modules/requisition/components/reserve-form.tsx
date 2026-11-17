"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

import { reserveRequisitionAction } from "../actions/action.reserve-requisition";

/** One line the custodian may reserve, with the figures the form shows. */
export type ReserveLine = {
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  /** Outstanding quantity still to reserve. */
  needQty: string;
  /** Item's usable on hand minus active reservations. */
  availableQty: string;
  /** The most the custodian can reserve now: min(need, available). */
  maxQty: string;
};

/** Drops trailing zeros for display without pulling server-only code into the bundle. */
function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * Reservation form shown to the Custodian on an approved or awaiting-stock
 * request. Quantities start at the most that can be reserved and may be
 * lowered; the service re-checks every value against the outstanding need and
 * available stock under the header lock (BR-AC-03).
 */
export function ReserveForm({
  requisitionId,
  lines,
}: {
  requisitionId: number;
  lines: ReserveLine[];
}) {
  const [result, formAction] = useActionState(reserveRequisitionAction, null);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.requisitionLineId, line.maxQty])),
  );

  const payload = lines
    .filter((line) => Number(quantities[line.requisitionLineId] ?? "0") > 0)
    .map((line) => ({
      requisitionLineId: line.requisitionLineId,
      quantity: quantities[line.requisitionLineId] ?? "",
    }));

  const nothingReservable = lines.every((line) => Number(line.maxQty) <= 0);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Reserve stock</h2>
        <p className="text-sm text-muted-foreground">
          Each line starts at the most you can reserve now. Lower a quantity to hold back stock;
          whatever stays unreserved waits for more stock.
        </p>
      </div>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Needed</th>
              <th className="p-2 text-right font-medium">Available</th>
              <th className="p-2 text-right font-medium">Reserve</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => (
              <tr key={line.requisitionLineId}>
                <td className="p-2">
                  <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                  <span className="text-muted-foreground">({line.unit})</span>
                </td>
                <td className="p-2 text-right font-medium tabular-nums">{formatQuantity(line.needQty)}</td>
                <td className="p-2 text-right tabular-nums">{formatQuantity(line.availableQty)}</td>
                <td className="w-36 p-2 text-right">
                  {Number(line.maxQty) <= 0 ? (
                    <span className="text-sm text-muted-foreground">None to reserve</span>
                  ) : (
                    <Input
                      aria-label={`Quantity to reserve for ${line.itemName}`}
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormMessage result={result} />
      <div>
        <SubmitButton disabled={nothingReservable}>Reserve stock</SubmitButton>
      </div>
    </form>
  );
}
