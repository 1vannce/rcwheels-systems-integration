"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { createPurchaseOrderAction } from "../actions/action.create-purchase-order";
import type { PurchaseOrderFormContextDto } from "../types/purchasing.dto";
import { formatPrNumber } from "../utils/pr-number.util";

const selectClass = "field-control h-8";
const textareaClass = "field-control min-h-20 py-2";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function formatMoney(value: string): string {
  const amount = Number(value);

  return Number.isNaN(amount)
    ? value
    : amount.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

/** Prepares a pending PO from one open purchase request. */
export function CreatePurchaseOrderForm({
  context,
}: {
  context: PurchaseOrderFormContextDto;
}) {
  const [result, formAction] = useActionState(createPurchaseOrderAction, null);
  const { purchaseRequisition, lines, suppliers } = context;
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [line.purchaseRequisitionLineId, line.remainingQty]),
    ),
  );
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>({});

  const payload = lines
    .filter(
      (line) => Number(quantities[line.purchaseRequisitionLineId] ?? "0") > 0,
    )
    .map((line) => ({
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
      orderedQty: quantities[line.purchaseRequisitionLineId] ?? "",
      unitPrice: unitPrices[line.purchaseRequisitionLineId] ?? "",
    }));

  const total = lines.reduce((sum, line) => {
    const quantity = Number(quantities[line.purchaseRequisitionLineId] ?? "0");
    const price = Number(unitPrices[line.purchaseRequisitionLineId] ?? "0");

    return sum + (Number.isNaN(quantity * price) ? 0 : quantity * price);
  }, 0);

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Nothing left to order"
        description="Every line on this purchase request is already covered by a PO draft or purchase order."
      />
    );
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        title="No suppliers are available"
        description="The seeded supplier list is empty. Restore the seed data before preparing a purchase order."
      />
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Prepare a purchase order</h2>
        <p className="text-sm text-muted-foreground">
          Source PR {formatPrNumber(purchaseRequisition.purchaseRequisitionId)}{" "}
          requested by {purchaseRequisition.requestedByName} on{" "}
          {dateFormat.format(purchaseRequisition.requestedAt)}. This PO will
          wait for Accounting review before it can be placed.
        </p>
      </div>

      <input
        type="hidden"
        name="purchaseRequisitionId"
        value={purchaseRequisition.purchaseRequisitionId}
      />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplierId">Supplier</Label>
          <select
            id="supplierId"
            name="supplierId"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="" disabled>
              Select a supplier
            </option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplierId} value={supplier.supplierId}>
                {supplier.supplierName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryTerms">Delivery terms</Label>
          <textarea
            id="deliveryTerms"
            name="deliveryTerms"
            rows={2}
            maxLength={300}
            className={textareaClass}
            placeholder="Lead time, delivery arrangement, or other terms"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Remaining</th>
              <th className="p-2 text-right font-medium">Quantity</th>
              <th className="p-2 text-right font-medium">Unit price</th>
              <th className="p-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => {
              const quantity = quantities[line.purchaseRequisitionLineId] ?? "";
              const price = unitPrices[line.purchaseRequisitionLineId] ?? "";
              const lineTotal = Number(quantity) * Number(price);

              return (
                <tr key={line.purchaseRequisitionLineId}>
                  <td className="p-2">
                    <span className="font-medium">{line.itemCode}</span>{" "}
                    {line.itemName}{" "}
                    <span className="text-muted-foreground">({line.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(line.remainingQty)}
                  </td>
                  <td className="w-32 p-2 text-right">
                    <Input
                      aria-label={`Quantity to order for ${line.itemName}`}
                      value={quantity}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.purchaseRequisitionLineId]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      className="text-right"
                      required
                    />
                  </td>
                  <td className="w-36 p-2 text-right">
                    <Input
                      aria-label={`Unit price for ${line.itemName}`}
                      value={price}
                      onChange={(event) =>
                        setUnitPrices((current) => ({
                          ...current,
                          [line.purchaseRequisitionLineId]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      className="text-right"
                      placeholder="0.00"
                      required={Number(quantity) > 0}
                    />
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums">
                    {formatMoney(
                      Number.isNaN(lineTotal) ? "0" : String(lineTotal),
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estimated total:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatMoney(String(total))}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Quantities start at the remaining PR quantity and can be lowered.
        </p>
      </div>

      <FormMessage result={result} />

      <div className="flex items-center gap-3">
        <SubmitButton>Create purchase order</SubmitButton>
        <Button
          type="button"
          variant="outline"
          render={<Link href="/purchasing/requisitions" />}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
