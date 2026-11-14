"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
 * Requests whose acknowledgement receipt is prepared and that are waiting to
 * be dispatched. Each row links to the detail screen with the release button.
 */
export function DispatchQueue({
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
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search RF number, requester, or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={tab === "all" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setTab("all")}
          >
            All <span className="ml-1 opacity-70">({requisitions.length})</span>
          </Button>
          <Button
            size="sm"
            variant={tab === "urgent" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setTab("urgent")}
          >
            Urgent <span className="ml-1 opacity-70">({urgentCount})</span>
          </Button>
        </div>
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
              <th className="p-3 font-medium">DISPATCH ITEMS</th>
              <th className="p-3 font-medium">STATUS</th>
              <th className="p-3 text-right font-medium">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  {requisitions.length === 0
                    ? "No requests are waiting to be dispatched."
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
                          for <span className="font-medium text-foreground">{req.requesterName}</span> [Mechanic]
                        </p>
                      ) : (
                        req.deliveryLocation && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.deliveryLocation}
                          </p>
                        )
                      )}
                    </td>

                    {/* Dispatch items */}
                    <td className="p-3 align-top">
                      {lines.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {req.lineCount} item{req.lineCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lines.map((l) => {
                            const qty = formatQuantity(l.reservedQty);
                            const reqQty = formatQuantity(l.requestedQty);
                            const hasQty = compareQuantities(l.reservedQty, "0") > 0;

                            return (
                              <span
                                key={l.requisitionLineId}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                                  hasQty
                                    ? "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300 font-medium"
                                    : "border-border/60 bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                <span>{l.itemCode}</span>
                                <span>·</span>
                                <span>
                                  {qty} of {reqQty} {l.unit}
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
                        className="h-8 gap-1 text-xs"
                        render={<Link href={`/requisitions/${req.requisitionId}`} />}
                      >
                        View &amp; Dispatch
                        <ArrowRight className="h-3.5 w-3.5" />
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
