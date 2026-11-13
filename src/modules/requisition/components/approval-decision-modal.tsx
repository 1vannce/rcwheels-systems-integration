"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

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
      <DialogTrigger render={<Button size="sm" />}>
        Review &amp; Decide
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <DialogHeader className="gap-1 border-b pb-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg font-semibold">
              Review &amp; Decide · {rfNumber}
            </DialogTitle>
            {isUrgent && (
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                URGENT
              </span>
            )}
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
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

        {/* Content body */}
        <div className="flex flex-col gap-4 pt-2">
          {!isRejecting ? (
            /* Approve Form */
            <form action={approveAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />
              <input type="hidden" name="lines" value={JSON.stringify(payload)} />

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="p-3">ITEM</th>
                      <th className="p-3 text-right">REQUESTED</th>
                      <th className="p-3 text-center">APPROVE</th>
                      <th className="p-3 text-right">AVAILABLE</th>
                      <th className="p-3">PURPOSE</th>
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
                            <p className="text-muted-foreground text-xs line-clamp-1">
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
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
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

              <FormMessage result={approveResult} />

              <DialogFooter className="pt-2">
                <Link
                  href={`/requisitions/${requisitionId}`}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Open full detail
                </Link>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRejecting(true)}
                  >
                    Reject
                  </Button>
                  <SubmitButton size="sm">
                    Approve Requisition
                  </SubmitButton>
                </div>
              </DialogFooter>
            </form>
          ) : (
            /* Reject Form */
            <form action={rejectAction} className="flex flex-col gap-4">
              <input type="hidden" name="requisitionId" value={requisitionId} />

              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={`reason-${requisitionId}`}
                    className="text-xs font-medium text-destructive"
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRejecting(false)}
                >
                  ← Back to approval
                </Button>

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
