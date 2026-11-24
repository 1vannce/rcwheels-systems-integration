"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { UrgentBadge } from "@/components/ui/status-badge";
import type { RequisitionListItemDto, RequisitionStatus } from "../types/requisition.dto";
import { RequisitionStatusBadge } from "./requisition-status-badge";
import { formatRfNumber } from "../utils/rf-number.util";

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
  mode?: "all" | "completed" | "rejected";
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
    } else if (mode === "rejected") {
      result = result.filter((r) =>
        ["rejected", "pending_resolution"].includes(r.status),
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
          { id: "all", label: "All completed", count: requisitions.filter((r) => ["fulfilled", "rejected", "cancelled"].includes(r.status)).length },
          { id: "fulfilled", label: "Fulfilled", count: requisitions.filter((r) => r.status === "fulfilled").length },
          { id: "rejected", label: "Rejected", count: requisitions.filter((r) => r.status === "rejected").length },
          { id: "cancelled", label: "Cancelled", count: requisitions.filter((r) => r.status === "cancelled").length },
        ]
      : mode === "rejected"
      ? [
          { id: "all", label: "All rejected", count: requisitions.filter((r) => ["rejected", "pending_resolution"].includes(r.status)).length },
          { id: "rejected", label: "Rejected", count: requisitions.filter((r) => r.status === "rejected").length },
          { id: "pending_resolution", label: "Pending resolution", count: requisitions.filter((r) => r.status === "pending_resolution").length },
        ]
      : [
          { id: "all", label: "All", count: requisitions.length },
          { id: "pending_approval", label: "Pending approval", count: requisitions.filter((r) => r.status === "pending_approval").length },
          { id: "approved", label: "Approved", count: requisitions.filter((r) => r.status === "approved").length },
          { id: "awaiting_stock", label: "Awaiting stock", count: requisitions.filter((r) => r.status === "awaiting_stock").length },
          { id: "for_delivery_all", label: "For delivery", count: requisitions.filter((r) => r.status === "for_delivery" || r.status === "out_for_delivery").length },
          { id: "delivered", label: "Delivered", count: requisitions.filter((r) => r.status === "delivered").length },
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
              aria-pressed={selectedTab === tab.id}
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
            placeholder="Search RF number, requester, or location"
            aria-label="Search requests"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No requests match these filters"
          description="Choose another status or clear the search to see more requests."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3 font-medium">RF number</th>
                <th className="p-3 font-medium">Priority</th>
                <th className="p-3 font-medium">Submitted</th>
                <th className="p-3 font-medium">Requester</th>
                <th className="p-3 font-medium">Delivery</th>
                <th className="p-3 text-right font-medium">Items</th>
                <th className="p-3 font-medium">Status</th>
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
                      {recipientIsDifferent && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          for <span className="font-medium text-foreground">{req.requesterName}</span> (mechanic)
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
