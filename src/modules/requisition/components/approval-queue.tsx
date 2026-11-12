"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PendingApprovalItemDto } from "../types/requisition.dto";
import {
  ApprovalDecisionModal,
  formatRfNumber,
  type ApprovalDecisionLine,
} from "./approval-decision-modal";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/** Drops trailing zeros for compact display. */
function fmt(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

type Tab = "all" | "urgent";

/**
 * The assigned approver's queue matching the application's shadcn/ui design system.
 */
export function ApprovalQueue({
  requisitions,
}: {
  requisitions: PendingApprovalItemDto[];
}) {
  const [tab, setTab] = useState<Tab>("all");

  const urgentCount = requisitions.filter((r) => r.isUrgent).length;
  const pendingCount = requisitions.length;

  const displayed =
    tab === "urgent" ? requisitions.filter((r) => r.isUrgent) : requisitions;

  if (requisitions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No requests are waiting for your approval.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Urgent alert banner */}
      {urgentCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <span className="text-base text-amber-600 dark:text-amber-400" aria-hidden="true">
            ⚠
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">
              {urgentCount} urgent request{urgentCount !== 1 ? "s" : ""} need immediate review
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Fast-tracked requests bypass the standard queue.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabButton
          active={tab === "all"}
          onClick={() => setTab("all")}
          count={pendingCount}
          label="Pending Approval"
        />
        <TabButton
          active={tab === "urgent"}
          onClick={() => setTab("urgent")}
          count={urgentCount}
          label="Urgent"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs font-medium text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">RF NUMBER</th>
              <th className="p-3 font-medium">PRIORITY</th>
              <th className="p-3 font-medium">SUBMITTED</th>
              <th className="p-3 font-medium">REQUESTER</th>
              <th className="p-3 font-medium">ITEMS &amp; STOCK PRE-CHECK</th>
              <th className="p-3 text-right font-medium">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayed.map((req) => {
              const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt);
              const lines = req.lines ?? [];
              const modalLines: ApprovalDecisionLine[] = lines.map((l) => ({
                requisitionLineId: l.requisitionLineId,
                itemCode: l.itemCode,
                itemName: l.itemName,
                unit: l.unit,
                requestedQty: l.requestedQty,
                availableStock: l.availableStock,
              }));

              const recipientIsDifferent = req.requestedForUserId !== null;

              return (
                <tr key={req.requisitionId} className="hover:bg-muted/50 transition-colors">
                  {/* RF Number */}
                  <td className="p-3 align-top whitespace-nowrap">
                    <Link
                      href={`/requisitions/${req.requisitionId}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {rfNumber}
                    </Link>
                  </td>

                  {/* Priority */}
                  <td className="p-3 align-top whitespace-nowrap">
                    {req.isUrgent ? (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        URGENT
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Normal</span>
                    )}
                  </td>

                  {/* Submitted */}
                  <td className="p-3 align-top whitespace-nowrap text-xs text-muted-foreground">
                    {dateFormat.format(req.submittedAt)}
                  </td>

                  {/* Requester */}
                  <td className="p-3 align-top">
                    <p className="font-medium">{req.submittedByName}</p>
                    {recipientIsDifferent ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        for <span className="font-medium text-foreground">{req.requesterName}</span> [Mechanic] · {req.deliveryLocation}
                      </p>
                    ) : (
                      req.deliveryLocation && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {req.deliveryLocation}
                        </p>
                      )
                    )}
                  </td>

                  {/* Items & Stock Pre-Check */}
                  <td className="p-3 align-top">
                    {lines.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {req.lineCount} item{req.lineCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {lines.slice(0, 3).map((line) => {
                          const avail = Number(line.availableStock);
                          const qty = fmt(line.requestedQty);
                          const availStock = fmt(line.availableStock);
                          return (
                            <span
                              key={line.requisitionLineId}
                              className="inline-flex items-center gap-1.5 text-xs"
                            >
                              <span className="font-medium">
                                {line.itemCode} ×{qty}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  avail > 0
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : "border-destructive/30 bg-destructive/10 text-destructive"
                                }`}
                              >
                                {avail > 0 ? `In stock (${availStock})` : "Out of stock"}
                              </span>
                            </span>
                          );
                        })}
                        {lines.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{lines.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Action */}
                  <td className="p-3 align-top text-right whitespace-nowrap">
                    <ApprovalDecisionModal
                      requisitionId={req.requisitionId}
                      rfNumber={rfNumber}
                      isUrgent={req.isUrgent}
                      submittedAt={req.submittedAt}
                      submittedByName={req.submittedByName}
                      recipientName={req.requesterName}
                      deliveryLocation={req.deliveryLocation}
                      purpose={req.purpose}
                      deliveryDate={req.deliveryDate}
                      lines={modalLines}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  label,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="gap-2"
    >
      {label}
      <span
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
          active
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </Button>
  );
}
