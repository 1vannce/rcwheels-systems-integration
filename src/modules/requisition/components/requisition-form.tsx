"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { resubmitRequisitionAction } from "../actions/action.resubmit-requisition";
import { submitRequisitionAction } from "../actions/action.submit-requisition";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const textareaClass =
  "min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** One item the requester may choose, with the quantity still available. */
export type RequisitionFormItem = {
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  available: string;
};

/** Values a resubmit pre-fills from the rejected request. */
export type RequisitionFormInitial = {
  requesterName?: string;
  purpose?: string;
  deliveryDate?: string;
  deliveryLocation?: string;
  isUrgent?: boolean;
  lines?: { itemId: number; requestedQty: string }[];
};

/** One editable line. `key` is stable so React keeps each row's inputs. */
type LineRow = {
  key: number;
  itemId: string;
  requestedQty: string;
};

const firstLine = (itemId: string): LineRow => ({ key: 0, itemId, requestedQty: "1" });

/**
 * Requisition form, used both to create and to correct a request.
 *
 * Lines are kept in React state and posted as JSON in a hidden field, because
 * the form can grow or shrink. The action re-validates that JSON with the
 * Create or Resubmit DTO; nothing here is trusted by the server.
 */
export function RequisitionForm({
  items,
  minimumDeliveryDate,
  mode = "submit",
  initial,
  requisitionId,
  submitLabel = "Submit for approval",
}: {
  items: RequisitionFormItem[];
  minimumDeliveryDate: string;
  /** "submit" posts a new request; "resubmit" corrects a rejected one. */
  mode?: "submit" | "resubmit";
  /** Pre-filled values for a resubmit. */
  initial?: RequisitionFormInitial;
  /** The request being corrected, when `mode` is "resubmit". */
  requisitionId?: number;
  submitLabel?: string;
}) {
  const action = mode === "resubmit" ? resubmitRequisitionAction : submitRequisitionAction;
  const [result, formAction] = useActionState(action, null);

  const [lines, setLines] = useState<LineRow[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((line, index) => ({
        key: index,
        itemId: String(line.itemId),
        requestedQty: line.requestedQty,
      }));
    }

    return [firstLine(String(items[0]?.itemId ?? ""))];
  });
  const [nextKey, setNextKey] = useState(initial?.lines?.length ?? 1);

  const payload = lines
    .filter((line) => line.itemId !== "")
    .map((line) => ({ itemId: Number(line.itemId), requestedQty: line.requestedQty }));

  function updateLine(key: number, changes: Partial<Omit<LineRow, "key">>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, { ...firstLine(String(items[0]?.itemId ?? "")), key: nextKey }]);
    setNextKey((key) => key + 1);
  }

  function removeLine(key: number) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((line) => line.key !== key),
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        No items exist yet. Ask the Inventory Custodian to add items before requesting stock.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4">
      {mode === "resubmit" && <input type="hidden" name="requisitionId" value={requisitionId} />}
      {/* The action parses this with the Create or Resubmit DTO. */}
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requesterName">For (optional)</Label>
          <Input
            id="requesterName"
            name="requesterName"
            maxLength={120}
            defaultValue={initial?.requesterName ?? ""}
            placeholder="Leave blank when the request is for you"
          />
        </div>
        <div className="flex items-end pb-1.5">
          <Label htmlFor="isUrgent" className="flex items-center gap-2 font-normal">
            <input
              id="isUrgent"
              name="isUrgent"
              type="checkbox"
              defaultChecked={initial?.isUrgent ?? false}
              className="size-4 rounded border-input"
            />
            Mark as urgent
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="purpose">Purpose</Label>
        <textarea
          id="purpose"
          name="purpose"
          required
          rows={2}
          maxLength={300}
          defaultValue={initial?.purpose ?? ""}
          className={textareaClass}
          placeholder="What the items are for"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryDate">Delivery date</Label>
          <Input
            id="deliveryDate"
            name="deliveryDate"
            type="date"
            min={minimumDeliveryDate}
            required
            defaultValue={initial?.deliveryDate ?? minimumDeliveryDate}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryLocation">Delivery location</Label>
          <Input
            id="deliveryLocation"
            name="deliveryLocation"
            maxLength={200}
            required
            defaultValue={initial?.deliveryLocation ?? ""}
            placeholder="Where the items should be delivered"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Items</legend>
        {lines.map((line, index) => (
          <div key={line.key} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`item-${line.key}`} className={index === 0 ? undefined : "sr-only"}>
                Item
              </Label>
              <select
                id={`item-${line.key}`}
                value={line.itemId}
                onChange={(event) => updateLine(line.key, { itemId: event.target.value })}
                required
                className={selectClass}
              >
                {items.map((item) => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.itemCode} · {item.itemName} ({item.available} {item.unit} available)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`qty-${line.key}`} className={index === 0 ? undefined : "sr-only"}>
                Quantity
              </Label>
              <Input
                id={`qty-${line.key}`}
                value={line.requestedQty}
                onChange={(event) => updateLine(line.key, { requestedQty: event.target.value })}
                inputMode="decimal"
                required
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeLine(line.key)}
              disabled={lines.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            Add line
          </Button>
        </div>
      </fieldset>

      <FormMessage result={result} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
