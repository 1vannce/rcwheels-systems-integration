"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { createRequisitionAction } from "../actions/requisition.actions";
import type { RequisitionItemOption } from "../types/requisition.type";

export function RequisitionForm({
  items,
  requesterName,
  minimumDeliveryDate,
}: {
  items: RequisitionItemOption[];
  requesterName: string;
  minimumDeliveryDate: string;
}) {
  const [result, formAction] = useActionState(createRequisitionAction, null);
  const [lineIds, setLineIds] = useState([0]);
  const [nextLineId, setNextLineId] = useState(1);

  function addLine() {
    setLineIds((current) => [...current, nextLineId]);
    setNextLineId((current) => current + 1);
  }

  function removeLine(lineId: number) {
    setLineIds((current) => current.filter((candidate) => candidate !== lineId));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">New requisition</h2>
        <p className="text-sm text-muted-foreground">
          Submit for yourself or enter the mechanic this request is for.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requesterName">Requested for</Label>
          <Input
            id="requesterName"
            name="requesterName"
            defaultValue={requesterName}
            maxLength={120}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryDate">Needed by</Label>
          <Input
            id="deliveryDate"
            name="deliveryDate"
            type="date"
            min={minimumDeliveryDate}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="deliveryLocation">Delivery location</Label>
          <Input
            id="deliveryLocation"
            name="deliveryLocation"
            maxLength={200}
            placeholder="Workshop, bay, or other location"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="purpose">Reason for request</Label>
          <textarea
            id="purpose"
            name="purpose"
            className="min-h-24 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            maxLength={1000}
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input name="isUrgent" type="checkbox" className="size-4 accent-primary" />
        Mark this request as urgent
      </label>

      <section className="flex flex-col gap-3" aria-labelledby="request-items-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="request-items-heading" className="font-medium">
              Items requested
            </h3>
            <p className="text-sm text-muted-foreground">Add one or more item lines.</p>
          </div>
          <Button type="button" variant="outline" onClick={addLine}>
            Add item
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No items are available yet. Contact the inventory team before submitting a request.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {lineIds.map((lineId, index) => (
              <div
                key={lineId}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`itemId_${lineId}`}>Item {index + 1}</Label>
                  <select
                    id={`itemId_${lineId}`}
                    name={`itemId_${lineId}`}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose an item
                    </option>
                    {items.map((item) => (
                      <option key={item.itemId} value={item.itemId}>
                        {item.itemCode} — {item.itemName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`quantity_${lineId}`}>Quantity</Label>
                  <Input
                    id={`quantity_${lineId}`}
                    name={`quantity_${lineId}`}
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    required
                  />
                </div>
                {lineIds.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeLine(lineId)}
                    aria-label={`Remove item ${index + 1}`}
                  >
                    Remove
                  </Button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <FormMessage result={result} />
      <div>
        <SubmitButton {...(items.length === 0 ? { disabled: true } : {})}>
          Submit request
        </SubmitButton>
      </div>
    </form>
  );
}
