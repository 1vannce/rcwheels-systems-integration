"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { prepareAcknowledgementReceiptAction } from "../actions/action.prep-requisition-AR";

/** One line of the dispatch being prepared. */
export type ArLine = {
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  /** Quantity already reserved for this line. */
  reservedQty: string;
  /** The most that may be sent now: min(reserved, unissued). */
  maxQty: string;
};

/** Drops trailing zeros for display without pulling server-only code into the bundle. */
function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * AR preparation form. The Custodian names the delivery person and confirms
 * how much of each reserved line goes out. It creates the dispatch and the
 * acknowledgement receipt but deducts no stock; the service re-checks every
 * quantity against the reservation and the unissued need (BR-DL-02).
 */
export function ArPreparationForm({
  requisitionId,
  lines,
}: {
  requisitionId: number;
  lines: ArLine[];
}) {
  const [result, formAction] = useActionState(prepareAcknowledgementReceiptAction, null);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.requisitionLineId, line.maxQty])),
  );

  const payload = lines
    .filter((line) => Number(quantities[line.requisitionLineId] ?? "0") > 0)
    .map((line) => ({
      requisitionLineId: line.requisitionLineId,
      sentQty: quantities[line.requisitionLineId] ?? "",
    }));

  const nothingToSend = lines.every((line) => Number(line.maxQty) <= 0);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-medium">Prepare acknowledgement receipt</h2>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="deliveryPersonnel">Delivery personnel</Label>
        <Input
          id="deliveryPersonnel"
          name="deliveryPersonnel"
          required
          maxLength={120}
          placeholder="Who will deliver the items"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Reserved</th>
              <th className="p-2 text-right font-medium">Send</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => (
              <tr key={line.requisitionLineId}>
                <td className="p-2">
                  {line.itemCode} · {line.itemName}{" "}
                  <span className="text-muted-foreground">({line.unit})</span>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatQuantity(line.reservedQty)}
                </td>
                <td className="w-36 p-2 text-right">
                  {Number(line.maxQty) <= 0 ? (
                    <span className="text-muted-foreground">Not reserved</span>
                  ) : (
                    <Input
                      aria-label={`Quantity to send for ${line.itemName}`}
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
        <SubmitButton disabled={nothingToSend}>Prepare AR and set For Delivery</SubmitButton>
      </div>
    </form>
  );
}
