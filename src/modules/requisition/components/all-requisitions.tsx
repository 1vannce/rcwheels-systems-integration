"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RequisitionListItemDto, RequisitionStatus } from "../types/requisition.dto";
import { RequisitionStatusBadge } from "./requisition-status-badge";
import { formatRfNumber } from "./approval-decision-modal";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const deliveryDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export type AllRequisitionsProps = {
  requisitions: RequisitionListItemDto[];
  mode?: "all" | "completed";
};

export function AllRequisitions({ requisitions, mode = "all" }: AllRequisitionsProps) {
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    let result = requisitions;

    // Mode filter
    if (mode === "completed") {
      result = result.filter((r) =>
        ["fulfilled", "rejected", "cancelled"].includes(r.status),
      );
    }

    // Status tab filter
    if (selectedTab !== "all") {
      if (selectedTab === "for_delivery_all") {
        result = result.filter(
          (r) => r.status === "for_delivery" || r.status === "out_for_delivery",
        );
      } else if (selectedTab === "completed_tab") {
        result = result.filter((r) =>
          ["fulfilled", "rejected", "cancelled"].includes(r.status),
        );
      } else {
        result = result.filter((r) => r.status === selectedTab);
      }
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          formatRfNumber(r.requisitionId, r.submittedAt).toLowerCase().includes(q) ||
          r.requisitionId.toString().includes(q) ||
          r.submittedByName.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.purpose.toLowerCase().includes(q) ||
          r.deliveryLocation.toLowerCase().includes(q),
      );
    }

    return result;
  }, [requisitions, mode, selectedTab, searchQuery]);

  const tabs =
    mode === "completed"
      ? [
          { id: "all", label: "All Completed", count: requisitions.filter((r) => ["fulfilled", "rejected", "cancelled"].includes(r.status)).length },
          { id: "fulfilled", label: "Fulfilled", count: requisitions.filter((r) => r.status === "fulfilled").length },
          { id: "rejected", label: "Rejected", count: requisitions.filter((r) => r.status === "rejected").length },
          { id: "cancelled", label: "Cancelled", count: requisitions.filter((r) => r.status === "cancelled").length },
        ]
      : [
          { id: "all", label: "All", count: requisitions.length },
          { id: "pending_approval", label: "Pending Approval", count: requisitions.filter((r) => r.status === "pending_approval").length },
          { id: "approved", label: "Approved", count: requisitions.filter((r) => r.status === "approved").length },
          { id: "awaiting_stock", label: "Awaiting Stock", count: requisitions.filter((r) => r.status === "awaiting_stock").length },
          { id: "for_delivery_all", label: "For Delivery", count: requisitions.filter((r) => r.status === "for_delivery" || r.status === "out_for_delivery").length },
          { id: "completed_tab", label: "Completed", count: requisitions.filter((r) => ["fulfilled", "rejected", "cancelled"].includes(r.status)).length },
        ];

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={selectedTab === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTab(tab.id)}
              className="gap-2"
            >
              {tab.label}
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                  selectedTab === tab.id
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </Button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            type="search"
            placeholder="Search RF#, requester, bay..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No requisitions found matching the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs font-medium text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">RF NUMBER</th>
                <th className="p-3 font-medium">PRIORITY</th>
                <th className="p-3 font-medium">SUBMITTED</th>
                <th className="p-3 font-medium">REQUESTER</th>
                <th className="p-3 font-medium">DELIVERY</th>
                <th className="p-3 text-right font-medium">ITEMS</th>
                <th className="p-3 font-medium">STATUS</th>
                <th className="p-3 text-right font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((req) => {
                const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt);
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
                      {recipientIsDifferent && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          for <span className="font-medium text-foreground">{req.requesterName}</span> [Mechanic]
                        </p>
                      )}
                    </td>

                    {/* Delivery */}
                    <td className="p-3 align-top">
                      <p className="text-xs">{deliveryDateFormat.format(new Date(`${req.deliveryDate}T00:00:00Z`))}</p>
                      <p className="text-xs text-muted-foreground">{req.deliveryLocation}</p>
                    </td>

                    {/* Items */}
                    <td className="p-3 align-top text-right tabular-nums text-xs">
                      {req.lineCount}
                    </td>

                    {/* Status */}
                    <td className="p-3 align-top whitespace-nowrap">
                      <RequisitionStatusBadge status={req.status as RequisitionStatus} />
                    </td>

                    {/* Action */}
                    <td className="p-3 align-top text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/requisitions/${req.requisitionId}`} />}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
