"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Eye, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { UrgentBadge } from "@/components/ui/status-badge";
import type { RequisitionListItemDto, RequisitionStatus } from "../types/requisition.dto";
import { formatRfNumber } from "../utils/rf-number.util";
import { RequisitionStatusBadge } from "./requisition-status-badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

const shortDateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId =
  | "all"
  | "pending_approval"
  | "approved"
  | "awaiting_stock"
  | "for_delivery"
  | "fulfilled"
  | "pending_resolution"
  | "rejected"
  | "cancelled";

type TabDef = { id: TabId; label: string };

const TABS: TabDef[] = [
  { id: "all", label: "All" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "approved", label: "Approved" },
  { id: "awaiting_stock", label: "Awaiting stock" },
  { id: "for_delivery", label: "For delivery" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "pending_resolution", label: "Pending resolution" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

/** Statuses that satisfy a given tab. */
function statusesForTab(tab: TabId): RequisitionStatus[] | null {
  if (tab === "all") return null;
  if (tab === "for_delivery") return ["for_delivery", "out_for_delivery"];
  return [tab as RequisitionStatus];
}

// ---------------------------------------------------------------------------
// Board column definitions
// ---------------------------------------------------------------------------

type BoardColumn = {
  id: string;
  label: string;
  /** The dot colour class for the header indicator */
  dotClass: string;
  statuses: RequisitionStatus[];
};

const BOARD_COLUMNS: BoardColumn[] = [
  {
    id: "pending",
    label: "Pending approval",
    dotClass: "bg-amber-500",
    statuses: ["pending_approval"],
  },
  {
    id: "approved",
    label: "Approved",
    dotClass: "bg-neutral-900 dark:bg-neutral-100",
    statuses: ["approved", "awaiting_stock"],
  },
  {
    id: "delivery",
    label: "For delivery",
    dotClass: "bg-neutral-400",
    statuses: ["for_delivery", "out_for_delivery"],
  },
  {
    id: "attention",
    label: "Needs attention",
    dotClass: "bg-destructive",
    statuses: ["pending_resolution", "rejected"],
  },
  {
    id: "fulfilled",
    label: "Fulfilled",
    dotClass: "bg-emerald-500",
    statuses: ["fulfilled"],
  },
  {
    id: "cancelled",
    label: "Cancelled",
    dotClass: "bg-muted-foreground/50",
    statuses: ["cancelled"],
  },
];

// ---------------------------------------------------------------------------
// Stock allocation label helper
// ---------------------------------------------------------------------------

function stockAllocationLabel(status: RequisitionStatus): string {
  switch (status) {
    case "pending_approval":
      return "Not yet allocated";
    case "approved":
    case "for_delivery":
    case "out_for_delivery":
      return "Reserved";
    case "awaiting_stock":
      return "Awaiting stock";
    case "pending_resolution":
      return "Discrepancy under review";
    case "fulfilled":
      return "Issued and accepted";
    case "rejected":
      return "No allocation";
    case "cancelled":
      return "No allocation";
    default:
      return "—";
  }
}

function stockAllocationClass(status: RequisitionStatus): string {
  switch (status) {
    case "approved":
    case "for_delivery":
    case "out_for_delivery":
      return "text-emerald-700 dark:text-emerald-400";
    case "awaiting_stock":
      return "text-amber-700 dark:text-amber-400";
    case "pending_resolution":
      return "text-amber-700 dark:text-amber-400";
    case "fulfilled":
      return "text-emerald-700 dark:text-emerald-400";
    case "rejected":
    case "cancelled":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type MyRequestsViewProps = {
  requisitions: RequisitionListItemDto[];
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MyRequestsView({ requisitions }: MyRequestsViewProps) {
  const [view, setView] = useState<"list" | "board">("list");
  const [selectedTab, setSelectedTab] = useState<TabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // --- filtered slice ---
  const filtered = useMemo(() => {
    let result = [...requisitions];

    // Status tab
    const statuses = statusesForTab(selectedTab);
    if (statuses) {
      result = result.filter((r) => statuses.includes(r.status as RequisitionStatus));
    }

    // Urgent toggle
    if (urgentOnly) {
      result = result.filter((r) => r.isUrgent);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((r) => new Date(r.submittedAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((r) => new Date(r.submittedAt) <= to);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          formatRfNumber(r.requisitionId, r.submittedAt).toLowerCase().includes(q) ||
          r.requisitionId.toString().includes(q) ||
          r.submittedByName.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.purpose.toLowerCase().includes(q),
      );
    }

    return result;
  }, [requisitions, selectedTab, urgentOnly, dateFrom, dateTo, searchQuery]);

  // Count per tab (using the full unfiltered set for tab counts)
  function tabCount(tab: TabId): number {
    if (tab === "all") return requisitions.length;
    const statuses = statusesForTab(tab);
    if (!statuses) return 0;
    return requisitions.filter((r) => statuses.includes(r.status as RequisitionStatus)).length;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: search + controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="min-w-48 max-w-xs flex-1">
          <Input
            type="search"
            placeholder="Search RF number, requester, or purpose"
            aria-label="Search requests"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9"
          />
        </div>

        {/* Urgent Only toggle */}
        <div className="flex items-center gap-2">
          <button
            id="urgent-only"
            type="button"
            role="switch"
            aria-checked={urgentOnly}
            onClick={() => setUrgentOnly((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              urgentOnly ? "bg-signal" : "bg-input"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
                urgentOnly ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </button>
          <label
            htmlFor="urgent-only"
            className="cursor-pointer text-sm whitespace-nowrap text-muted-foreground select-none"
          >
            Urgent only
          </label>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="date"
            aria-label="Submitted from"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="field-control h-9 w-auto px-2"
          />
          <span className="text-xs">to</span>
          <input
            type="date"
            aria-label="Submitted to"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="field-control h-9 w-auto px-2"
          />
        </div>

        {/* View toggle */}
        <div role="group" aria-label="Layout" className="ml-auto flex items-center overflow-hidden rounded-md border border-input bg-card">
          <button
            type="button"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
            className={`flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring ${
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            className={`flex h-9 items-center gap-1.5 px-3 text-sm font-medium transition-colors focus-visible:relative focus-visible:outline-2 focus-visible:outline-ring ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <List aria-hidden="true" className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => {
          const count = tabCount(tab.id);
          const isActive = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Views */}
      {view === "list" ? (
        <ListView items={filtered} />
      ) : (
        <BoardView items={filtered} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function ListView({ items }: { items: RequisitionListItemDto[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No requests match these filters"
        description="Choose another status, clear the dates, or turn off urgent only."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="data-table">
        <thead>
          <tr>
            <th className="p-3 font-medium whitespace-nowrap">RF number</th>
            <th className="p-3 font-medium whitespace-nowrap">Submitted</th>
            <th className="p-3 font-medium whitespace-nowrap">Requester</th>
            <th className="p-3 font-medium">Items</th>
            <th className="p-3 font-medium whitespace-nowrap">Priority</th>
            <th className="p-3 font-medium whitespace-nowrap">Status</th>
            <th className="p-3 font-medium whitespace-nowrap">Stock allocation</th>
            <th className="p-3 font-medium whitespace-nowrap text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((req) => {
            const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt);
            const isForSomeoneElse = req.requestedForUserId !== null;

            return (
              <tr
                key={req.requisitionId}
                className="hover:bg-muted/50 transition-colors"
              >
                {/* RF Number */}
                <td className="p-3 align-middle whitespace-nowrap">
                  <Link
                    href={`/requisitions/${req.requisitionId}`}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {rfNumber}
                  </Link>
                </td>

                {/* Submitted */}
                <td className="p-3 align-middle whitespace-nowrap text-xs text-muted-foreground">
                  <div>{dateFormat.format(new Date(req.submittedAt))}</div>
                  <div className="mt-0.5">
                    {new Intl.DateTimeFormat("en-PH", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      timeZone: "Asia/Manila",
                    }).format(new Date(req.submittedAt))}
                  </div>
                </td>

                {/* Requester */}
                <td className="p-3 align-middle">
                  <p className="font-medium text-sm">{req.submittedByName}</p>
                  {isForSomeoneElse && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      for <span className="font-medium text-foreground">{req.requesterName}</span> (mechanic)
                    </p>
                  )}
                </td>

                {/* Items summary */}
                <td className="p-3 align-middle max-w-56">
                  <p className="truncate text-sm text-foreground">{req.purpose}</p>
                  <p className="text-xs text-muted-foreground">
                    {req.lineCount} {req.lineCount === 1 ? "item" : "items"}
                  </p>
                </td>

                {/* Urgency */}
                <td className="p-3 align-middle whitespace-nowrap">
                  {req.isUrgent ? (
                    <UrgentBadge />
                  ) : (
                    <span className="text-xs text-muted-foreground">Normal</span>
                  )}
                </td>

                {/* Status */}
                <td className="p-3 align-middle whitespace-nowrap">
                  <RequisitionStatusBadge status={req.status as RequisitionStatus} />
                </td>

                {/* Stock allocation */}
                <td className={`p-3 align-middle whitespace-nowrap text-xs font-medium ${stockAllocationClass(req.status as RequisitionStatus)}`}>
                  {stockAllocationLabel(req.status as RequisitionStatus)}
                </td>

                {/* Actions */}
                <td className="p-3 align-middle text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      
                      render={<Link href={`/requisitions/${req.requisitionId}`} />}
                    >
                      <Eye aria-hidden="true" className="h-3 w-3" />
                      View
                    </Button>

                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board View
// ---------------------------------------------------------------------------

function BoardView({ items }: { items: RequisitionListItemDto[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {BOARD_COLUMNS.map((col) => {
        const colItems = items.filter((r) =>
          col.statuses.includes(r.status as RequisitionStatus),
        );

        return (
          <div
            key={col.id}
            className="w-72 flex-shrink-0 rounded-lg border bg-muted/50"
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dotClass}`} />
                <span className="text-sm font-semibold">{col.label}</span>
              </div>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background border text-[10px] font-semibold text-muted-foreground px-1">
                {colItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 max-h-[70vh] overflow-y-auto">
              {colItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                  <FileText aria-hidden="true" className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">No requests</p>
                  {col.id === "delivery" && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Reserved stock with an AR, or already sent
                    </p>
                  )}
                  {col.id === "cancelled" && (
                    <p className="text-[10px] text-muted-foreground/70">Cancelled requests</p>
                  )}
                </div>
              ) : (
                colItems.map((req) => <BoardCard key={req.requisitionId} req={req} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board Card
// ---------------------------------------------------------------------------

function BoardCard({ req }: { req: RequisitionListItemDto }) {
  const rfNumber = formatRfNumber(req.requisitionId, req.submittedAt);
  const isForSomeoneElse = req.requestedForUserId !== null;
  const initials = req.submittedByName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  // For pending_resolution / rejected — show a contextual message
  const needsAttentionMessage =
    req.status === "rejected"
      ? "This request was rejected. Review the reason and resubmit if needed."
      : req.status === "pending_resolution"
        ? "A delivery discrepancy is under review. Check the request details."
        : null;

  return (
    <Link
      href={`/requisitions/${req.requisitionId}`}
      className="block rounded-md border bg-card p-3 transition-colors hover:border-primary/40"
    >
      {/* RF + urgency */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-primary">{rfNumber}</span>
        {req.isUrgent && (
          <UrgentBadge />
        )}
      </div>

      {/* Purpose / items */}
      <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1">
        {req.purpose}
        {req.lineCount > 1 && (
          <span className="font-normal text-muted-foreground">
            {" "}
            ×{req.lineCount}
          </span>
        )}
      </p>

      {/* For mechanic tag */}
      {isForSomeoneElse && (
        <p className="mb-1.5 text-xs text-muted-foreground">for {req.requesterName}</p>
      )}

      {/* Status badge (for awaiting_stock, pending_resolution) */}
      {(req.status === "awaiting_stock" || req.status === "pending_resolution") && (
        <div className="mb-1.5">
          <RequisitionStatusBadge status={req.status as RequisitionStatus} />
        </div>
      )}

      {/* Stock label for approved */}
      {req.status === "approved" && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mb-1.5">
          Reserved
        </p>
      )}

      {/* Needs attention message */}
      {needsAttentionMessage && (
        <p className="text-[11px] text-destructive leading-snug mb-1.5 line-clamp-2">
          {needsAttentionMessage}
        </p>
      )}

      {/* Footer: avatar + date */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted border text-[9px] font-bold text-muted-foreground">
            {initials}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {req.submittedByName.split(" ")[0]}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium ${
            req.status === "pending_resolution" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {shortDateFormat.format(new Date(req.submittedAt))}
        </span>
      </div>
    </Link>
  );
}
