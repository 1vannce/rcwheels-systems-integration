"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

import { approveRequisitionAction } from "../actions/action.approve-requisition";
import { rejectRequisitionAction } from "../actions/action.reject-requisition";
import type { RequisitionLineDto } from "../types/requisition.dto";

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Drops trailing zeros for display. */
function fmt(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Formats a numeric requisitionId as RF-YYYYMM-NNN using the submission date. */
export function formatRfNumber(requisitionId: number, submittedAt: Date): string {
  const d = new Date(submittedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const seq = String(requisitionId).padStart(3, "0");
  return `RF-${year}${month}-${seq}`;
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
 * "Review & Decide" quick-decision modal dialog matching Photo 2 reference.
 * Shows all lines with their available stock and lets the approver
 * set per-line quantities, then approve or reject in one step.
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

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        Review &amp; Decide
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 pt-5 pb-4">
          <DialogHeader className="mb-0">
            <div className="flex items-center gap-2 pr-8">
              <DialogTitle className="text-base font-bold text-foreground">
                Review &amp; Decide · {rfNumber}
              </DialogTitle>
              {isUrgent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                  URGENT
                </span>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Submitted {dateFormat.format(submittedAt)} by{" "}
              <span className="font-medium text-foreground">{submittedByName}</span>
              {recipientIsDifferent ? (
                <>
                  {" "}for{" "}
                  <span className="font-medium text-foreground">{recipientName}</span>{" "}
                  [Mechanic] · {deliveryLocation}
                </>
              ) : (
                deliveryLocation && <> · {deliveryLocation}</>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content body */}
        <div className="flex flex-col gap-4 p-6">
          {!isRejecting ? (
            /* Approve Form */
            <form action={approveAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />
              <input type="hidden" name="lines" value={JSON.stringify(payload)} />

              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3 text-right">Requested</th>
                      <th className="p-3 text-center">Approve</th>
                      <th className="p-3 text-right">Available</th>
                      <th className="p-3">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => {
                      const avail = Number(line.availableStock);
                      const availStock = fmt(line.availableStock);
                      const reqQty = fmt(line.requestedQty);

                      return (
                        <tr key={line.requisitionLineId}>
                          <td className="p-3 align-middle">
                            <p className="font-semibold text-foreground text-sm">{line.itemCode}</p>
                            <p className="text-muted-foreground text-[11px] line-clamp-1">
                              {line.itemName}
                            </p>
                          </td>
                          <td className="p-3 align-middle text-right tabular-nums whitespace-nowrap text-foreground font-medium">
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
                              className="h-8 w-16 text-center text-xs font-semibold mx-auto"
                              required
                            />
                          </td>
                          <td className="p-3 align-middle text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                avail > 0
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {availStock} {line.unit}
                            </span>
                          </td>
                          <td className="p-3 align-middle text-[11px] text-muted-foreground max-w-[180px]">
                            <p className="line-clamp-2 text-foreground/80">{purpose}</p>
                            <p className="text-muted-foreground/70 mt-0.5">Needed {deliveryDate}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <FormMessage result={approveResult} />

              <DialogFooter className="pt-2">
                <Link
                  href={`/requisitions/${requisitionId}`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Open full detail
                </Link>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    ✕ Reject
                  </button>
                  <SubmitButton className="h-8 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800">
                    ✓ Approve Requisition
                  </SubmitButton>
                </div>
              </DialogFooter>
            </form>
          ) : (
            /* Reject Form */
            <form action={rejectAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />

              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={`reason-${requisitionId}`}
                    className="text-xs font-bold uppercase tracking-wide text-destructive"
                  >
                    Reason for Rejection <span aria-hidden="true">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Required for the requester to make corrections
                  </span>
                </div>
                <textarea
                  id={`reason-${requisitionId}`}
                  name="reason"
                  required
                  rows={3}
                  maxLength={300}
                  className={textareaClass}
                  placeholder="Explain why this request is being rejected so the requester can correct it..."
                />
              </div>

              <FormMessage result={rejectResult} />

              <DialogFooter className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  ← Back to approval
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(false)}
                    className="inline-flex items-center rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <SubmitButton variant="destructive" className="h-8 rounded-lg px-4 text-xs font-semibold">
                    Confirm Rejection
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
