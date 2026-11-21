"use client";

import Link from "next/link";
import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UrgentBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { PendingApprovalItemDto } from "../types/requisition.dto";
import { formatRfNumber } from "../utils/rf-number.util";
import {
  ApprovalDecisionModal,
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

type Tab = "all" | "urgent" | "out_of_stock";

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
  const outOfStockCount = requisitions.filter((r) =>
    (r.lines ?? []).some((l) => Number(l.availableStock) <= 0),
  ).length;

  const displayed =
    tab === "urgent"
      ? requisitions.filter((r) => r.isUrgent)
      : tab === "out_of_stock"
        ? requisitions.filter((r) => (r.lines ?? []).some((l) => Number(l.availableStock) <= 0))
        : requisitions;

  if (requisitions.length === 0) {
    return (
      <EmptyState
        title="No requests are waiting for your approval"
        description="Requests assigned to you appear here when they are submitted. You'll also get a notification."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Urgent alert banner */}
      {urgentCount > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-signal/40 bg-signal/10 px-3 py-2.5 text-sm">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal-foreground" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">
              {urgentCount} urgent request{urgentCount !== 1 ? "s" : ""} need review first
            </p>
            <p className="text-xs text-muted-foreground">
              They are listed at the top of the queue.
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
          label="Pending approval"
        />
        <TabButton
          active={tab === "urgent"}
          onClick={() => setTab("urgent")}
          count={urgentCount}
          label="Urgent"
        />
        <TabButton
          active={tab === "out_of_stock"}
          onClick={() => setTab("out_of_stock")}
          count={outOfStockCount}
          label="Out of stock"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="data-table">
          <thead>
            <tr>
              <th className="p-3 font-medium">RF number</th>
              <th className="p-3 font-medium">Priority</th>
              <th className="p-3 font-medium">Submitted</th>
              <th className="p-3 font-medium">Requester</th>
              <th className="p-3 font-medium">Items and stock check</th>
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
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {rfNumber}
                    </Link>
                  </td>

                  {/* Priority */}
                  <td className="p-3 align-top whitespace-nowrap">
                    {req.isUrgent ? (
                      <UrgentBadge />
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
                        for <span className="font-medium text-foreground">{req.requesterName}</span> (mechanic), {req.deliveryLocation}
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
                              <span className="font-medium tabular-nums">
                                {line.itemCode} ×{qty}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  avail > 0
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : "border-destructive/30 bg-destructive/10 text-destructive"
                                }`}
                              >
                                {avail > 0 ? `${availStock} in stock` : "Out of stock"}
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
      aria-pressed={active}
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
