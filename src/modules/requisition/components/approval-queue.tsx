"use client";

import Link from "next/link";
import { useState } from "react";

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
 * The assigned approver's queue with tabs, an urgent alert, a pre-check column,
 * and a "Review & Decide" quick-decision modal per row.
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
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No requests are waiting for your approval.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Urgent alert banner */}
      {urgentCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-xs">
          <span className="mt-0.5 text-base text-amber-600" aria-hidden="true">
            ⚠
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">
              {urgentCount} urgent request{urgentCount !== 1 ? "s" : ""} need immediate review
            </p>
            <p className="text-xs text-amber-800">
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
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">RF Number</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Items &amp; Stock Pre-Check</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                <tr key={req.requisitionId} className="hover:bg-muted/30 transition-colors">
                  {/* RF Number */}
                  <td className="px-4 py-3.5 align-top whitespace-nowrap">
                    <Link
                      href={`/requisitions/${req.requisitionId}`}
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {rfNumber}
                    </Link>
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3.5 align-top whitespace-nowrap">
                    {req.isUrgent ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-700">
                        URGENT
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Normal</span>
                    )}
                  </td>

                  {/* Submitted */}
                  <td className="px-4 py-3.5 align-top whitespace-nowrap text-xs text-muted-foreground">
                    {dateFormat.format(req.submittedAt)}
                  </td>

                  {/* Requester */}
                  <td className="px-4 py-3.5 align-top">
                    <p className="font-medium text-foreground">{req.submittedByName}</p>
                    {recipientIsDifferent ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        for <span className="font-medium text-foreground/80">{req.requesterName}</span> [Mechanic] · {req.deliveryLocation}
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
                  <td className="px-4 py-3.5 align-top">
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
                              <span className="font-medium text-foreground">
                                {line.itemCode} ×{qty}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  avail > 0
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
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
                  <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
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
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "bg-blue-600 text-white shadow-xs"
          : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
          active
            ? "bg-white/20 text-white"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
