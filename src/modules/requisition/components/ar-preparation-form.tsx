"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { prepareAcknowledgementReceiptAction } from "../actions/action.prep-requisition-AR";
import { compareQuantities, formatQuantity, isQuantity } from "../utils/quantity.util";

/** One line of the dispatch being prepared. */
export type ArLine = {
  requisitionLineId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty?: string;
  unissuedQty?: string;
  /** Quantity already reserved for this line. */
  reservedQty: string;
  /** The most that may be sent now: min(reserved, unissued). */
  maxQty: string;
};

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
    .filter((line) => {
      const val = quantities[line.requisitionLineId] ?? "";
      return isQuantity(val) && compareQuantities(val, "0") > 0;
    })
    .map((line) => ({
      requisitionLineId: line.requisitionLineId,
      sentQty: quantities[line.requisitionLineId] ?? "",
    }));

  const nothingToSend = lines.every(
    (line) => !isQuantity(line.maxQty) || compareQuantities(line.maxQty, "0") <= 0,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Prepare acknowledgement receipt</h2>
        <p className="text-sm text-muted-foreground">
          Name who delivers the items and how much of each reserved line goes out now. No stock
          is deducted until the dispatch is released.
        </p>
      </div>
      <input type="hidden" name="requisitionId" value={requisitionId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="deliveryPersonnel">Delivery personnel</Label>
        <Input
          id="deliveryPersonnel"
          name="deliveryPersonnel"
          required
          maxLength={120}
          placeholder="Who will deliver the items"
        />
      </div>

      <p className="rounded-md border bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
        You can issue less than the unissued quantity. The remaining balance stays open for a
        later dispatch.
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Requested</th>
              <th className="p-2 text-right font-medium">Unissued</th>
              <th className="p-2 text-right font-medium">Reserved</th>
              <th className="p-2 text-right font-medium">Issue now</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => (
              <tr key={line.requisitionLineId}>
                <td className="p-2">
                  <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                  <span className="text-muted-foreground">({line.unit})</span>
                </td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {line.requestedQty ? formatQuantity(line.requestedQty) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {line.unissuedQty ? formatQuantity(line.unissuedQty) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums font-medium text-foreground">
                  {formatQuantity(line.reservedQty)}
                </td>
                <td className="w-36 p-2 text-right">
                  {!isQuantity(line.maxQty) || compareQuantities(line.maxQty, "0") <= 0 ? (
                    <span className="text-sm text-muted-foreground">Not reserved</span>
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
