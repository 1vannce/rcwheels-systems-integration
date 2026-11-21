"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { UrgentBadge } from "@/components/ui/status-badge";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { approveRequisitionAction } from "../actions/action.approve-requisition";
import { rejectRequisitionAction } from "../actions/action.reject-requisition";
import type { RequisitionLineDto } from "../types/requisition.dto";

const textareaClass = "field-control min-h-20 py-2";

/** Drops trailing zeros for display. */
function fmt(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export type ApprovalDecisionLine = Pick<
  RequisitionLineDto,
  | "requisitionLineId"
  | "itemCode"
  | "itemName"
  | "unit"
  | "requestedQty"
  | "availableStock"
>;

export type ApprovalDecisionModalProps = {
  requisitionId: number;
  rfNumber: string;
  isUrgent: boolean;
  submittedAt: Date;
  submittedByName: string;
  recipientName: string;
  deliveryLocation: string;
  purpose: string;
  deliveryDate: string;
  lines: ApprovalDecisionLine[];
};

/**
 * "Review & Decide" quick-decision modal dialog styled with the system's shadcn design.
 *
 * When one or more lines have zero available stock the modal shows:
 *   • a ⚠️ stock alert banner naming each out-of-stock item
 *   • an optional note field whose value goes to the Inventory Manager
 *   • the primary button relabelled "Approve & notify inventory"
 *
 * The Reject button is reserved for truly invalid requests and carries a
 * helper hint so approvers don't use it as a workaround for zero stock.
 */
export function ApprovalDecisionModal({
  requisitionId,
  rfNumber,
  isUrgent,
  submittedAt,
  submittedByName,
  recipientName,
  deliveryLocation,
  purpose,
  deliveryDate,
  lines,
}: ApprovalDecisionModalProps) {
  const [approveResult, approveAction] = useActionState(approveRequisitionAction, null);
  const [rejectResult, rejectAction] = useActionState(rejectRequisitionAction, null);
  const [isRejecting, setIsRejecting] = useState(false);

  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.requisitionLineId, fmt(l.requestedQty)])),
  );

  const payload = lines.map((l) => ({
    requisitionLineId: l.requisitionLineId,
    approvedQty: quantities[l.requisitionLineId] ?? "",
  }));

  const recipientIsDifferent = recipientName !== submittedByName;

  // Detect out-of-stock lines to drive the conditional UI.
  const outOfStockLines = lines.filter((l) => Number(l.availableStock) <= 0);
  const hasOutOfStock = outOfStockLines.length > 0;

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Review</DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
        {/* Header */}
        <DialogHeader className="gap-1 border-b pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl font-semibold [font-stretch:85%]">
              Review {rfNumber}
            </DialogTitle>
            {isUrgent && (
              <UrgentBadge />
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Submitted {dateFormat.format(submittedAt)} by{" "}
            <span className="font-medium text-foreground">{submittedByName}</span>
            {recipientIsDifferent ? (
              <>
                {" "}for{" "}
                <span className="font-medium text-foreground">{recipientName}</span>{" "}
                (mechanic), delivered to {deliveryLocation}
              </>
            ) : (
              deliveryLocation && <>, delivered to {deliveryLocation}</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Content body */}
        <div className="flex flex-col gap-4 pt-2">
          {!isRejecting ? (
            /* Approve Form */
            <form action={approveAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />
              <input type="hidden" name="lines" value={JSON.stringify(payload)} />

              {/* ⚠️ Out-of-stock alert banner — only shown when needed */}
              {hasOutOfStock && (
                <div className="flex items-start gap-3 rounded-md border border-signal/40 bg-signal/10 px-3 py-2.5 text-sm">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-signal-foreground"
                  />
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium">
                      Out of stock —{" "}
                      {outOfStockLines
                        .map((l) => `${l.itemCode} (${fmt(l.availableStock)} available)`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Approving will place this request on Backorder and automatically
                      notify the Inventory Manager to restock.
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3 text-right">Requested</th>
                      <th className="p-3 text-center">Approve</th>
                      <th className="p-3 text-right">Available</th>
                      <th className="p-3">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line) => {
                      const avail = Number(line.availableStock);
                      const availStock = fmt(line.availableStock);
                      const reqQty = fmt(line.requestedQty);

                      return (
                        <tr key={line.requisitionLineId}>
                          <td className="p-3 align-middle">
                            <p className="font-medium text-foreground">{line.itemCode}</p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {line.itemName}
                            </p>
                          </td>
                          <td className="p-3 align-middle text-right tabular-nums whitespace-nowrap font-medium">
                            {reqQty} {line.unit}
                          </td>
                          <td className="p-3 align-middle text-center w-24">
                            <Input
                              aria-label={`Approved quantity for ${line.itemName}`}
                              value={quantities[line.requisitionLineId] ?? ""}
                              onChange={(e) =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [line.requisitionLineId]: e.target.value,
                                }))
                              }
                              inputMode="decimal"
                              className="h-8 w-16 text-center text-xs font-medium mx-auto"
                              required
                            />
                          </td>
                          <td className="p-3 align-middle text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                                avail > 0
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "border-destructive/30 bg-destructive/10 text-destructive"
                              }`}
                            >
                              {availStock} {line.unit}
                            </span>
                          </td>
                          <td className="p-3 align-middle text-xs text-muted-foreground max-w-[180px]">
                            <p className="line-clamp-2 text-foreground">{purpose}</p>
                            <p className="text-muted-foreground mt-0.5">Needed {deliveryDate}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Optional note to Inventory Manager — only shown when out of stock */}
              {hasOutOfStock && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`inventory-note-${requisitionId}`} className="text-xs font-medium">
                    Note to Inventory Manager{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <textarea
                    id={`inventory-note-${requisitionId}`}
                    name="inventoryNote"
                    rows={2}
                    maxLength={300}
                    className={textareaClass}
                    placeholder="e.g. Needed urgently for bay 2 alignment job"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This goes straight into the Inventory Manager&apos;s notification.
                  </p>
                </div>
              )}

              <FormMessage result={approveResult} />

              <DialogFooter className="pt-2">
                <Link
                  href={`/requisitions/${requisitionId}`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Open full detail
                </Link>

                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end gap-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsRejecting(true)}
                    >
                      Reject
                    </Button>
                    {hasOutOfStock && (
                      <span className="text-[10px] text-muted-foreground">
                        For invalid requests only
                      </span>
                    )}
                  </div>
                  <SubmitButton size="sm">
                    {hasOutOfStock ? "Approve & notify inventory" : "Approve request"}
                  </SubmitButton>
                </div>
              </DialogFooter>
            </form>
          ) : (
            /* Reject Form */
            <form action={rejectAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />

              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Label
                    htmlFor={`reason-${requisitionId}`}
                    className="text-xs font-medium text-destructive"
                  >
                    Reason for rejecting <span aria-hidden="true">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    The requester sees this and can correct the request
                  </span>
                </div>
                <textarea
                  id={`reason-${requisitionId}`}
                  name="reason"
                  required
                  rows={3}
                  maxLength={300}
                  className={textareaClass}
                  placeholder="What the requester needs to change"
                />
              </div>

              <FormMessage result={rejectResult} />

              <DialogFooter className="pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRejecting(false)}
                  >
                    Cancel
                  </Button>
                  <SubmitButton variant="destructive" size="sm">
                    Reject request
                  </SubmitButton>
                </div>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

