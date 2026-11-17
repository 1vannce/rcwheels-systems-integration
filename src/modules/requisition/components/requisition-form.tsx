"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { resubmitRequisitionAction } from "../actions/action.resubmit-requisition";
import { submitRequisitionAction } from "../actions/action.submit-requisition";
import { formatRfNumber } from "../utils/rf-number.util";

const selectClass = "field-control h-8";

const textareaClass = "field-control min-h-20 py-2";

const readonlyInputClass = "field-control h-8";

/** One item the requester may choose, with the quantity still available. */
export type RequisitionFormItem = {
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  available: string;
  reorderPoint?: string;
};

export type RequisitionFormMechanic = {
  userId: number;
  fullName: string;
};

/** Values a resubmit pre-fills from the rejected request. */
export type RequisitionFormInitial = {
  requestedForUserId?: number | null;
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

/** Formats numbers cleanly without trailing zeros. */
function fmt(value: string | undefined): string {
  if (!value) return "0";
  const n = Number(value);
  return Number.isNaN(n) ? value : n.toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

export function RequisitionForm({
  items,
  mechanics,
  minimumDeliveryDate,
  currentUser,
  autoRfNumber,
  mode = "submit",
  initial,
  requisitionId,
  submitLabel = "Submit RF",
}: {
  items: RequisitionFormItem[];
  mechanics: RequisitionFormMechanic[];
  minimumDeliveryDate: string;
  currentUser?: { userId?: number; fullName: string; role: string };
  /** The automated next RF number predicted by the server, e.g. RF-202611-008. */
  autoRfNumber?: string;
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

  const itemMap = useMemo(
    () => new Map(items.map((item) => [String(item.itemId), item])),
    [items],
  );

  const payload = lines
    .filter((line) => line.itemId !== "")
    .map((line) => ({ itemId: Number(line.itemId), requestedQty: line.requestedQty }));

  function updateLine(key: number, changes: Partial<Omit<LineRow, "key">>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { ...firstLine(String(items[0]?.itemId ?? "")), key: nextKey },
    ]);
    setNextKey((key) => key + 1);
  }

  function removeLine(key: number) {
    setLines((current) =>
      current.length === 1 ? current : current.filter((line) => line.key !== key),
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="There are no items to request yet"
        description="Ask the Inventory Custodian to add items, then come back to file your request."
      />
    );
  }

  const displayRfNumber =
    mode === "resubmit" && requisitionId
      ? (autoRfNumber ?? formatRfNumber(requisitionId, new Date()))
      : (autoRfNumber ?? "auto");

  const employeeId = currentUser?.userId
    ? `EMP-${String(currentUser.userId).padStart(4, "0")}`
    : "EMP-0003";

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-lg border bg-card p-4 sm:p-6">
      {mode === "resubmit" && <input type="hidden" name="requisitionId" value={requisitionId} />}
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      {/* ── Top Metadata Section ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* RF no. */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-no" className="text-xs font-medium text-muted-foreground">
            RF no.
          </Label>
          <input
            id="rf-no"
            readOnly
            value={displayRfNumber}
            className={`${readonlyInputClass} text-base font-bold tabular-nums text-foreground [font-stretch:75%]`}
          />
        </div>

        {/* Requisition date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requisition-date" className="text-xs font-medium text-muted-foreground">
            Requisition date
          </Label>
          <input
            id="requisition-date"
            readOnly
            value={minimumDeliveryDate}
            className={readonlyInputClass}
          />
        </div>

        {/* Requester name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requester-name" className="text-xs font-medium text-muted-foreground">
            Requester name
          </Label>
          <input
            id="requester-name"
            readOnly
            value={currentUser?.fullName ?? "Rosa Villareal"}
            className={readonlyInputClass}
          />
        </div>

        {/* Employee ID */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employee-id" className="text-xs font-medium text-muted-foreground">
            Employee ID
          </Label>
          <input
            id="employee-id"
            readOnly
            value={employeeId}
            className={`${readonlyInputClass} tabular-nums`}
          />
        </div>

        {/* For mechanic (optional) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requestedForUserId" className="text-xs font-medium text-muted-foreground">
            For mechanic (optional)
          </Label>
          <select
            id="requestedForUserId"
            name="requestedForUserId"
            defaultValue={String(initial?.requestedForUserId ?? "")}
            className={selectClass}
          >
            <option value="">This request is for me</option>
            {mechanics.map((mechanic) => (
              <option key={mechanic.userId} value={mechanic.userId}>
                {mechanic.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Mark as urgent */}
        <div className="flex items-center gap-2 pt-6">
          <input
            id="isUrgent"
            name="isUrgent"
            type="checkbox"
            defaultChecked={initial?.isUrgent ?? false}
            className="size-4 accent-primary"
          />
          <Label htmlFor="isUrgent" className="cursor-pointer text-sm font-normal">
            Mark as urgent (goes to the top of the approver&apos;s queue)
          </Label>
        </div>

        {/* Delivery date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryDate" className="text-xs font-medium text-muted-foreground">
            Delivery date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deliveryDate"
            name="deliveryDate"
            type="date"
            min={minimumDeliveryDate}
            required
            defaultValue={initial?.deliveryDate ?? minimumDeliveryDate}
          />
        </div>

        {/* Delivery location */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryLocation" className="text-xs font-medium text-muted-foreground">
            Delivery location <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deliveryLocation"
            name="deliveryLocation"
            maxLength={200}
            required
            defaultValue={initial?.deliveryLocation ?? "Main Workshop Bay"}
            placeholder="Where the items should be delivered"
          />
        </div>
      </div>

      {/* Remarks / Purpose */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="purpose" className="text-xs font-medium text-muted-foreground">
          Purpose <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="purpose"
          name="purpose"
          required
          rows={2}
          maxLength={300}
          defaultValue={initial?.purpose ?? ""}
          className={textareaClass}
          placeholder="What the items are for (e.g. Brake replacement batch for Bay 2)"
        />
      </div>

      {/* ── Items Table Section ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Items</h2>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3 text-right">Reorder point</th>
                <th className="px-4 py-3 text-right">Suggested</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => {
                const item = itemMap.get(line.itemId);
                const availNum = Number(item?.available ?? "0");
                const ropNum = Number(item?.reorderPoint ?? "0");
                const suggestedQty = Math.max(0, ropNum - availNum);

                return (
                  <tr key={line.key} className="hover:bg-muted/30 transition-colors">
                    {/* Item dropdown / details */}
                    <td className="px-4 py-3">
                      <select
                        value={line.itemId}
                        onChange={(event) =>
                          updateLine(line.key, { itemId: event.target.value })
                        }
                        required
                        aria-label="Item"
                        className={selectClass}
                      >
                        {items.map((i) => (
                          <option key={i.itemId} value={i.itemId}>
                            {i.itemName} ({i.itemCode})
                          </option>
                        ))}
                      </select>
                      {item && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.itemCode}, unit {item.unit}
                        </p>
                      )}
                    </td>

                    {/* Shop Available */}
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      <span
                        className={
                          availNum <= 0
                            ? "font-semibold text-destructive"
                            : "text-foreground"
                        }
                      >
                        {fmt(item?.available)} {item?.unit}
                      </span>
                    </td>

                    {/* Reorder Point (ROP) */}
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {item?.reorderPoint ? `${fmt(item.reorderPoint)} ${item.unit}` : "—"}
                    </td>

                    {/* Suggested Qty */}
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {suggestedQty > 0 ? (
                        <span className="font-medium text-amber-700 dark:text-amber-300">
                          {suggestedQty} {item?.unit}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>

                    {/* Qty Requested input */}
                    <td className="w-28 px-4 py-3 text-right">
                      <Input
                        value={line.requestedQty}
                        onChange={(event) =>
                          updateLine(line.key, { requestedQty: event.target.value })
                        }
                        inputMode="decimal"
                        required
                        aria-label="Quantity requested"
                        className="text-right font-medium"
                      />
                    </td>

                    {/* Remove action */}
                    <td className="px-4 py-3 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <PlusIcon aria-hidden="true" />
            Add item
          </Button>
        </div>
      </div>

      <FormMessage result={result} />

      {/* ── Form Actions ── */}
      {result?.ok ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button render={<Link href="/requisitions/my-requests" />}>View my requests</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            Start another request
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-2">
          <SubmitButton>{submitLabel}</SubmitButton>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/requisitions/my-requests" />}
          >
            Cancel
          </Button>
        </div>
      )}
    </form>
  );
}
