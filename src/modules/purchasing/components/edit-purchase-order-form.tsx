"use client";

import { useActionState, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { updatePurchaseOrderAction } from "../actions/action.update-purchase-order";
import type { PurchaseOrderEditContextDto } from "../types/purchasing.dto";
import { formatPoNumber } from "../utils/po-number.util";

const selectClass = "field-control h-8";
const textareaClass = "field-control min-h-20 py-2";

function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Saves a revised PO version and sends it back to Accounting. */
export function EditPurchaseOrderForm({
  context,
}: {
  context: PurchaseOrderEditContextDto;
}) {
  const [result, formAction] = useActionState(updatePurchaseOrderAction, null);
  const { order, sourceLines, suppliers } = context;
  const sourceByLine = new Map(
    sourceLines.map((line) => [line.purchaseRequisitionLineId, line]),
  );
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [line.purchaseRequisitionLineId, line.orderedQty]),
    ),
  );
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      order.lines.map((line) => [line.purchaseRequisitionLineId, line.unitPrice]),
    ),
  );

  const payload = order.lines
    .filter(
      (line) => Number(quantities[line.purchaseRequisitionLineId] ?? "0") > 0,
    )
    .map((line) => ({
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
      orderedQty: quantities[line.purchaseRequisitionLineId] ?? "",
      unitPrice: unitPrices[line.purchaseRequisitionLineId] ?? "",
    }));

  const total = order.lines.reduce((sum, line) => {
    const quantity = Number(quantities[line.purchaseRequisitionLineId] ?? "0");
    const price = Number(unitPrices[line.purchaseRequisitionLineId] ?? "0");

    return sum + (Number.isNaN(quantity * price) ? 0 : quantity * price);
  }, 0);

  if (suppliers.length === 0) {
    return (
      <EmptyState
        title="No suppliers are available"
        description="Restore the seeded supplier list before revising this purchase order."
      />
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          Revise {formatPoNumber(order.purchaseOrderId)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Saving creates version {order.currentVersion + 1} and sends the PO back to
          Accounting. Earlier versions and their reviews stay in the history.
        </p>
      </div>

      <input type="hidden" name="purchaseOrderId" value={order.purchaseOrderId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplierId">Supplier</Label>
          <select
            id="supplierId"
            name="supplierId"
            required
            defaultValue={String(order.supplierId)}
            className={selectClass}
          >
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
            defaultValue={order.deliveryTerms ?? ""}
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
              <th className="p-2 text-right font-medium">Available to this PO</th>
              <th className="p-2 text-right font-medium">Quantity</th>
              <th className="p-2 text-right font-medium">Unit price</th>
              <th className="p-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {order.lines.map((line) => {
              const source = sourceByLine.get(line.purchaseRequisitionLineId);
              const available = source?.remainingQty ?? line.orderedQty;
              const quantity = quantities[line.purchaseRequisitionLineId] ?? "";
              const price = unitPrices[line.purchaseRequisitionLineId] ?? "";
              const lineTotal = Number(quantity) * Number(price);

              return (
                <tr key={line.purchaseOrderLineId}>
                  <td className="p-2">
                    <span className="font-medium">{line.itemCode}</span> {line.itemName}{" "}
                    <span className="text-muted-foreground">({line.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQuantity(available)}
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
                    {formatMoney(Number.isNaN(lineTotal) ? 0 : lineTotal)}
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
            {formatMoney(total)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Available is the PR need minus every other active PO.
        </p>
      </div>

      <FormMessage result={result} />

      <div>
        <SubmitButton>Save new version</SubmitButton>
      </div>
    </form>
  );
}
