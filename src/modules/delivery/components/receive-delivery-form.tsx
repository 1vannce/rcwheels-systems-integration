"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/modules/core";
import type { PurchaseOrderLineDto } from "@/modules/purchasing";

import { receiveSupplierDeliveryAction } from "../actions/supplier-receiving.actions";
import { formatQuantity } from "../utils/quantity.util";
import {
  emptyReceivingLine,
  isBlankReceivingLine,
  receivingLineError,
  toReceivingPayloadLine,
  type ReceivingLineDraft,
} from "./receiving-lines";

const quantityFields = [
  { name: "deliveredQty", label: "Delivered" },
  { name: "acceptedQty", label: "Accepted" },
  { name: "rejectedQty", label: "Rejected" },
] as const;

/**
 * The Custodian records one supplier delivery: the receipt numbers, then the
 * delivered, accepted, and rejected quantity of each PO line that arrived.
 * `lines` holds the lines still outstanding. It is empty once the PO closes;
 * the form stays mounted so the success message survives that refresh.
 */
export function ReceiveDeliveryForm({
  purchaseOrderId,
  lines,
}: {
  purchaseOrderId: number;
  lines: PurchaseOrderLineDto[];
}) {
  const [deliveryReceiptNo, setDeliveryReceiptNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [drafts, setDrafts] = useState<Record<number, ReceivingLineDraft>>({});
  // Entries are cleared only on success, so a refusal keeps what was typed.
  const [result, formAction, isSaving] = useActionState(
    async (previous: ActionResult | null, formData: FormData) => {
      const next = await receiveSupplierDeliveryAction(previous, formData);

      if (next.ok) {
        setDeliveryReceiptNo("");
        setInvoiceNo("");
        setDrafts({});
      }

      return next;
    },
    null,
  );

  const rows = lines.map((line) => {
    const draft = drafts[line.purchaseOrderLineId] ?? emptyReceivingLine;
    const blank = isBlankReceivingLine(draft);

    return {
      line,
      draft,
      blank,
      error: blank ? null : receivingLineError(draft, line.outstandingQty),
    };
  });
  const entered = rows.filter((row) => !row.blank);
  const valid = entered.length > 0 && entered.every((row) => row.error === null);
  const payload = JSON.stringify(
    entered.map((row) => toReceivingPayloadLine(row.line.purchaseOrderLineId, row.draft)),
  );

  function update(id: number, field: keyof ReceivingLineDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? emptyReceivingLine), [field]: value },
    }));
  }

  if (lines.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <FormMessage result={result} />
        <p className="text-sm text-muted-foreground">
          This purchase order is not open for receiving.
        </p>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      <input type="hidden" name="lines" value={payload} />
      <FormMessage result={result} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Delivery receipt number</span>
          <Input
            name="deliveryReceiptNo"
            required
            maxLength={60}
            value={deliveryReceiptNo}
            onChange={(event) => setDeliveryReceiptNo(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Invoice number (optional)</span>
          <Input
            name="invoiceNo"
            maxLength={60}
            value={invoiceNo}
            onChange={(event) => setInvoiceNo(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col divide-y rounded-md border">
        {rows.map(({ line, draft, error }) => {
          const id = line.purchaseOrderLineId;

          return (
            <fieldset key={id} className="flex flex-col gap-3 p-3">
              <legend className="sr-only">
                {line.itemCode} {line.itemName}
              </legend>
              <div>
                <p className="font-medium">
                  {line.itemCode} {line.itemName}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {formatQuantity(line.outstandingQty)} {line.unit} outstanding of{" "}
                  {formatQuantity(line.orderedQty)} ordered
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {quantityFields.map(({ name, label }) => (
                  <label key={name} className="flex flex-col gap-1 text-sm">
                    <span>
                      {label} ({line.unit})
                    </span>
                    <Input
                      inputMode="decimal"
                      className="w-28 tabular-nums"
                      value={draft[name]}
                      aria-invalid={error !== null}
                      onChange={(event) => update(id, name, event.target.value)}
                    />
                  </label>
                ))}
                <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
                  <span>Inspection note (required if rejected)</span>
                  <Input
                    maxLength={300}
                    value={draft.inspectionNotes}
                    onChange={(event) => update(id, "inspectionNotes", event.target.value)}
                  />
                </label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </fieldset>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Leave a line blank if it was not in this delivery. Accepted items are added to stock;
        rejected items stay outstanding on the purchase order.
      </p>
      <div>
        {/* `disabled` replaces SubmitButton's own pending check, so repeat it
            here: a double click must not record the delivery twice. */}
        <SubmitButton disabled={!valid || isSaving}>Record delivery</SubmitButton>
      </div>
    </form>
  );
}
