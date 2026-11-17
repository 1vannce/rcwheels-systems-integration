"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UrgentBadge } from "@/components/ui/status-badge";

import type { RequisitionQueueItemDto } from "../types/requisition.dto";
import { compareQuantities, formatQuantity } from "../utils/quantity.util";
import { formatRfNumber } from "../utils/rf-number.util";
import { RequisitionStatusBadge } from "./requisition-status-badge";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

/**
 * The Custodian's AR preparation queue.
 * Lists requests that have reserved stock waiting for an Acknowledgement Receipt
 * to be prepared (full or partial issue).
 */
export function ArPreparationQueue({
  requisitions,
}: {
  requisitions: RequisitionQueueItemDto[];
}) {
  const [tab, setTab] = useState<"all" | "urgent">("all");
  const [search, setSearch] = useState("");

  const urgentCount = requisitions.filter((r) => r.isUrgent).length;

  const filtered = requisitions.filter((req) => {
    if (tab === "urgent" && !req.isUrgent) {
      return false;
    }

    if (!search.trim()) {
      return true;
    }

    const q = search.toLowerCase();
    const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt).toLowerCase();
    const matchesRf = rfNumber.includes(q);
    const matchesRequester =
      req.submittedByName.toLowerCase().includes(q) ||
      req.requesterName.toLowerCase().includes(q);
    const matchesItems =
      req.lines?.some(
        (l) =>
          l.itemCode.toLowerCase().includes(q) || l.itemName.toLowerCase().includes(q),
      ) ?? false;

    return matchesRf || matchesRequester || matchesItems;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search RF number, requester, or item"
            aria-label="Search requests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={tab === "all" ? "default" : "outline"}
            aria-pressed={tab === "all"}
            onClick={() => setTab("all")}
          >
            All <span className="tabular-nums opacity-75">{requisitions.length}</span>
          </Button>
          <Button
            size="sm"
            variant={tab === "urgent" ? "default" : "outline"}
            aria-pressed={tab === "urgent"}
            onClick={() => setTab("urgent")}
          >
            Urgent <span className="tabular-nums opacity-75">{urgentCount}</span>
          </Button>
        </div>
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
              <th className="p-3 font-medium">Reserved items</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  {requisitions.length === 0
                    ? "No reserved requests are waiting for an acknowledgement receipt. Reserve stock from the issue queue first."
                    : "No requests match your current search or filter."}
                </td>
              </tr>
            ) : (
              filtered.map((req) => {
                const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt);
                const lines = req.lines ?? [];
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
                          for <span className="font-medium text-foreground">{req.requesterName}</span> (mechanic)
                        </p>
                      ) : (
                        req.deliveryLocation && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.deliveryLocation}
                          </p>
                        )
                      )}
                    </td>

                    {/* Reserved items */}
                    <td className="p-3 align-top">
                      {lines.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {req.lineCount} item{req.lineCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lines.map((l) => {
                            const resQty = formatQuantity(l.reservedQty);
                            const reqQty = formatQuantity(l.requestedQty);
                            const hasReserved = compareQuantities(l.reservedQty, "0") > 0;

                            return (
                              <span
                                key={l.requisitionLineId}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                                  hasReserved
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium"
                                    : "border-border/60 bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                <span>{l.itemCode}</span>
                                <span>
                                  {resQty} of {reqQty} {l.unit}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3 align-top whitespace-nowrap">
                      <RequisitionStatusBadge status={req.status} />
                    </td>

                    {/* Action */}
                    <td className="p-3 align-top whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/requisitions/${req.requisitionId}`} />}
                      >
                        Prepare AR
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
