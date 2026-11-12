"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Eye, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RequisitionListItemDto, RequisitionStatus } from "../types/requisition.dto";
import { RequisitionStatusBadge } from "./requisition-status-badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a numeric requisitionId as RF-YYYYMM-NNN based on submission date. */
function formatRfNumber(requisitionId: number, submittedAt: Date): string {
  const d = new Date(submittedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const seq = String(requisitionId).padStart(3, "0");
  return `RF-${year}${month}-${seq}`;
}

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
  { id: "pending_approval", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "awaiting_stock", label: "Awaiting Stock" },
  { id: "for_delivery", label: "For Delivery" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "pending_resolution", label: "Pending Resolution" },
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
    label: "Pending Approval",
    dotClass: "bg-amber-500",
    statuses: ["pending_approval"],
  },
  {
    id: "approved",
    label: "Approved",
    dotClass: "bg-sky-500",
    statuses: ["approved", "awaiting_stock"],
  },
  {
    id: "delivery",
    label: "For Delivery",
    dotClass: "bg-sky-400",
    statuses: ["for_delivery", "out_for_delivery"],
  },
  {
    id: "attention",
    label: "Needs Attention",
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
      return "Awaiting Stock (Shortfall PR issued)";
    case "pending_resolution":
      return "Discrepancy under review";
    case "fulfilled":
      return "Issued & accepted";
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
        <div className="flex-1 min-w-48 max-w-xs">
          <Input
            type="search"
            placeholder="Search RF number (RF-202611-001), requester, item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-xs"
          />
        </div>

        {/* Urgent Only toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          {/* Simple toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={urgentOnly}
            onClick={() => setUrgentOnly((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              urgentOnly ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
                urgentOnly ? "translate-x-[18px]" : "translate-x-[2px]"
              }`}
            />
          </button>
          <span className="text-sm text-muted-foreground whitespace-nowrap">Urgent Only</span>
        </label>

        {/* Date range */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-md border border-input bg-transparent overflow-hidden ml-auto">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium transition-colors ${
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium transition-colors ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => {
          const count = tabCount(tab.id);
          const isActive = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No requisitions match the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs font-medium text-muted-foreground">
          <tr>
            <th className="p-3 font-medium whitespace-nowrap">RF NUMBER</th>
            <th className="p-3 font-medium whitespace-nowrap">DATE &amp; TIME SUBMITTED</th>
            <th className="p-3 font-medium whitespace-nowrap">REQUESTER</th>
            <th className="p-3 font-medium">ITEMS SUMMARY</th>
            <th className="p-3 font-medium whitespace-nowrap">URGENCY</th>
            <th className="p-3 font-medium whitespace-nowrap">STATUS</th>
            <th className="p-3 font-medium whitespace-nowrap">STOCK ALLOCATION</th>
            <th className="p-3 font-medium whitespace-nowrap text-right">ACTIONS</th>
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
                    className="font-medium text-primary underline-offset-4 hover:underline"
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
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                      for {req.requesterName} [Mechanic]
                    </span>
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      🔥 URGENT
                    </span>
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
                      className="h-7 gap-1 text-xs"
                      render={<Link href={`/requisitions/${req.requisitionId}`} />}
                    >
                      <Eye className="h-3 w-3" />
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
            className="w-72 flex-shrink-0 rounded-xl border bg-muted/40"
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
                  <FileText className="h-7 w-7 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Nothing here yet</p>
                  {col.id === "delivery" && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Authorized and on the way to the shop
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
      className="block rounded-lg border bg-background p-3 hover:shadow-sm hover:border-primary/30 transition-all"
    >
      {/* RF + urgency */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-mono text-muted-foreground">{rfNumber}</span>
        {req.isUrgent && (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            🔥 Urgent
          </span>
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
        <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary mb-1.5">
          for {req.requesterName}
        </span>
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
          📅 {shortDateFormat.format(new Date(req.submittedAt))}
        </span>
      </div>
    </Link>
  );
}
