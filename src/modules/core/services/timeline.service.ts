import "server-only";

import { db } from "@/db";

import {
  findTimelineAuditEntries,
  findTimelineDiscrepancies,
  findTimelinePurchaseOrderLines,
  findTimelinePurchaseRequisitions,
  findTimelineReceipts,
  findTimelineStatusHistory,
  findTimelineStockArrivals,
  findTimelineSupplierDiscrepancies,
  findTimelineSupplierReceipts,
} from "../repositories/timeline.repository";
import type { TimelineEvent, TimelineEventKind, TimelineRecord } from "../types/timeline.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { roleCanAccessScreen } from "./role-access.service";

// The linked-record timeline of one requisition (BR-GN-07). It only reads: the
// status history gives the request's own decisions, and the audit log gives
// what happened to every record linked to it.

// The timeline must not show text the viewer cannot read on the record's own
// screens. These match the SDR viewer roles and the roles with a PO page.
const SDR_NOTE_ROLES: readonly AppRole[] = [
  "inventory_custodian",
  "purchasing_staff",
  "accounting_associate",
];
const PO_NOTE_ROLES: readonly AppRole[] = [
  "purchasing_staff",
  "accounting_associate",
  "system_administrator",
];

/**
 * Cause before effect. Records written in one transaction share a timestamp,
 * so this order breaks the tie.
 */
const KIND_ORDER: readonly TimelineEventKind[] = [
  "created",
  "resubmitted",
  "approved",
  "rejected",
  "reserved",
  "awaiting_stock",
  "pr_created",
  "po_created",
  "po_revised",
  "po_returned",
  "po_approved",
  "po_placed",
  "po_discarded",
  "po_balance_cancelled",
  "supplier_receipt",
  "po_partially_received",
  "po_closed",
  "sdr_opened",
  "sdr_updated",
  "sdr_agreed",
  "sdr_resolved",
  "stock_arrived",
  "ar_prepared",
  "dispatched",
  "delivery_decided",
  "rdr_opened",
  "return_received",
  "return_inspected",
  "rdr_resolved",
  "cancelled",
  "delivered",
  "fulfilled",
];

const PURCHASE_ORDER_EVENTS: Record<string, [TimelineEventKind, string]> = {
  "purchase_order.create": ["po_created", "Purchase order created and sent to Accounting"],
  "purchase_order.revise": ["po_revised", "Purchase order revised and sent to Accounting"],
  "purchase_order.return": ["po_returned", "Accounting returned the purchase order"],
  "purchase_order.approve": ["po_approved", "Accounting approved the purchase order"],
  "purchase_order.place": ["po_placed", "Purchase order placed with the supplier"],
  "purchase_order.discard": ["po_discarded", "Purchase order draft discarded"],
  "purchase_order.cancel_balance": ["po_balance_cancelled", "Purchase order balance cancelled"],
  "purchase_order.partially_receive": ["po_partially_received", "Purchase order partially received"],
  "purchase_order.close": ["po_closed", "Purchase order closed"],
};

const SDR_EVENTS: Record<string, [TimelineEventKind, string]> = {
  "supplier_discrepancy.create": ["sdr_opened", "Supplier discrepancy report opened"],
  "supplier_discrepancy.update": ["sdr_updated", "Supplier discrepancy report corrected"],
  "supplier_discrepancy.agree": ["sdr_agreed", "Supplier action agreed"],
  "supplier_discrepancy.resolve": ["sdr_resolved", "Supplier discrepancy report resolved"],
};

type AuditRow = Awaited<ReturnType<typeof findTimelineAuditEntries>>[number];

type EventSource = { occurredAt: Date; actorName: string | null; sequence: number };

function parseDetails(changeDetails: string | null): Record<string, unknown> {
  if (!changeDetails) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(changeDetails);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function documentNumber(prefix: string, id: number): string {
  return `${prefix}-${String(id).padStart(4, "0")}`;
}

/** The reason typed for one rejected line, from a delivery.accept entry. */
function rejectionProblem(lines: unknown, dispatchLineId: number | undefined): string | null {
  const line = Array.isArray(lines)
    ? lines.find((entry) => entry?.dispatchLineId === dispatchLineId)
    : undefined;

  return text(line?.problem);
}

/** A record with no page of its own: SDRs, RDRs, and returns have none yet. */
function unlinked(prefix: string, id: number): TimelineRecord {
  return { number: documentNumber(prefix, id), href: null };
}

/** Status changes that are events of their own; the rest follow a record event. */
function statusEvent(from: string | null, to: string): [TimelineEventKind, string] | null {
  if (from === null) return ["created", "Request submitted"];
  if (from === to) return null;
  if (from === "rejected" && to === "pending_approval") {
    return ["resubmitted", "Request corrected and resubmitted"];
  }
  if (from === "pending_approval" && to === "approved") return ["approved", "Request approved"];
  if (to === "rejected") return ["rejected", "Request rejected"];
  if (to === "awaiting_stock") return ["awaiting_stock", "Marked Awaiting Stock"];
  if (to === "cancelled") return ["cancelled", "Request cancelled"];
  if (to === "delivered") return ["delivered", "Request Delivered"];
  if (to === "fulfilled") return ["fulfilled", "Request Fulfilled"];

  return null;
}

/**
 * Every dated event linked to one requisition, oldest first.
 *
 * It does not decide who may see the request: call it only after the request
 * itself loaded for this viewer (getRequisitionDetailService). The viewer only
 * decides which records get a link.
 */
export async function getRequisitionTimeline(
  viewer: AppUser,
  requisitionId: number,
): Promise<TimelineEvent[]> {
  const [history, receipts, discrepancies, purchaseRequisitions, poLines, arrivals] =
    await Promise.all([
      findTimelineStatusHistory(db, requisitionId),
      findTimelineReceipts(db, requisitionId),
      findTimelineDiscrepancies(db, requisitionId),
      findTimelinePurchaseRequisitions(db, requisitionId),
      findTimelinePurchaseOrderLines(db, requisitionId),
      findTimelineStockArrivals(db, requisitionId),
    ]);
  const purchaseOrderIds = [...new Set(poLines.map((line) => line.purchaseOrderId))];
  const [supplierReceipts, supplierDiscrepancies] = await Promise.all([
    findTimelineSupplierReceipts(db, purchaseOrderIds),
    findTimelineSupplierDiscrepancies(
      db,
      poLines.map((line) => line.purchaseOrderLineId),
    ),
  ]);
  const unique = (ids: (number | null)[]) => [
    ...new Set(ids.filter((id): id is number => id !== null)),
  ];
  const audit = await findTimelineAuditEntries(db, [
    { entityType: "requisitions", entityIds: [requisitionId] },
    {
      entityType: "acknowledgement_receipts",
      entityIds: receipts.map((row) => row.acknowledgementReceiptId),
    },
    {
      entityType: "internal_discrepancies",
      entityIds: unique(discrepancies.map((row) => row.internalDiscrepancyId)),
    },
    { entityType: "returns", entityIds: unique(discrepancies.map((row) => row.returnId)) },
    {
      entityType: "return_lines",
      entityIds: unique(discrepancies.map((row) => row.returnLineId)),
    },
    {
      entityType: "purchase_requisitions",
      entityIds: purchaseRequisitions.map((row) => row.purchaseRequisitionId),
    },
    { entityType: "purchase_orders", entityIds: purchaseOrderIds },
    {
      entityType: "supplier_receipts",
      entityIds: supplierReceipts.map((row) => row.supplierReceiptId),
    },
    {
      entityType: "supplier_discrepancies",
      entityIds: supplierDiscrepancies.map((row) => row.supplierDiscrepancyId),
    },
  ]);

  // A link is offered only where the viewer's role can open the page and the
  // record is on it.
  function purchaseRequisitionRecord(id: number): TimelineRecord {
    // The PR queue is the only PR page, and it lists open PRs.
    const isQueued = purchaseRequisitions.some(
      (row) => row.purchaseRequisitionId === id && row.status === "open",
    );

    return {
      number: documentNumber("PR", id),
      href:
        isQueued && roleCanAccessScreen(viewer.role, "purchasing-pr-queue")
          ? "/purchasing/requisitions"
          : null,
    };
  }

  function purchaseOrderRecord(id: number): TimelineRecord {
    // The PO editor page serves Purchasing Staff only; the Accounting review
    // page shows the PO to Accounting and the System Administrator.
    let href: string | null = null;

    if (viewer.role === "purchasing_staff") {
      href = `/purchasing/orders/${id}`;
    } else if (roleCanAccessScreen(viewer.role, "purchasing-accounting-review")) {
      href = `/purchasing/accounting-review/${id}`;
    }

    return { number: documentNumber("PO", id), href };
  }

  function receiptRecords(
    match: (row: (typeof receipts)[number]) => boolean,
  ): TimelineRecord[] {
    const receipt = receipts.find(match);

    if (!receipt) {
      return [];
    }

    // The acceptance page lists only released, unsigned ARs, and a requester
    // sees only the ones they have to sign.
    const awaitingSignature = receipt.dispatchStatus === "dispatched" && !receipt.signedAt;
    const listedForViewer =
      viewer.role !== "requester" ||
      viewer.userId === (receipt.requestedForUserId ?? receipt.submittedBy);

    return [
      {
        number: documentNumber("AR", receipt.acknowledgementReceiptId),
        href:
          awaitingSignature &&
          listedForViewer &&
          roleCanAccessScreen(viewer.role, "delivery-acceptance-and-ar-signing")
            ? "/delivery/acceptance"
            : null,
      },
    ];
  }

  const events: (TimelineEvent & { sequence: number })[] = [];

  function add(
    kind: TimelineEventKind,
    title: string,
    source: EventSource,
    records: TimelineRecord[] = [],
    note: string | null = null,
  ) {
    // One source row can produce several events, such as two RDRs.
    events.push({ key: `${kind}-${events.length}`, kind, title, records, note, ...source });
  }

  for (const row of history) {
    const event = statusEvent(row.fromStatus, row.toStatus);

    if (event) {
      const source = {
        occurredAt: row.changedAt,
        actorName: row.actorName,
        sequence: row.historyId,
      };

      add(...event, source, [], row.reason);
    }
  }

  // Actions not named here, including blocked attempts, are not timeline events.
  function addAuditEvent(row: AuditRow) {
    const details = parseDetails(row.changeDetails);
    const source = { occurredAt: row.occurredAt, actorName: row.actorName, sequence: row.auditId };

    switch (row.action) {
      case "requisition.reserve":
        add("reserved", "Stock reserved", source);
        return;
      case "requisition.prepare-ar":
        add(
          "ar_prepared",
          "Acknowledgement receipt prepared",
          source,
          receiptRecords(
            (receipt) => receipt.acknowledgementReceiptId === details.acknowledgementReceiptId,
          ),
        );
        return;
      case "requisition.dispatch":
        add(
          "dispatched",
          "Items dispatched",
          source,
          receiptRecords((receipt) => receipt.dispatchId === details.dispatchId),
        );
        return;
      case "delivery.accept": {
        const rejected = Array.isArray(details.discrepancyIds)
          ? details.discrepancyIds.map(Number)
          : [];
        let title = "Delivery accepted and AR signed";

        if (rejected.length > 0) {
          title =
            details.acceptedLines === 0
              ? "Delivery rejected and AR signed"
              : "Delivery partly accepted and AR signed";
        }

        add(
          "delivery_decided",
          title,
          source,
          receiptRecords((receipt) => receipt.acknowledgementReceiptId === row.entityId),
        );

        for (const id of rejected) {
          const report = discrepancies.find((item) => item.internalDiscrepancyId === id);

          add(
            "rdr_opened",
            "Requester discrepancy report opened",
            source,
            [unlinked("RDR", id)],
            rejectionProblem(details.lines, report?.dispatchLineId),
          );
        }

        return;
      }
      case "delivery.resolve-rdr":
        add(
          "rdr_resolved",
          details.decision === "replace"
            ? "Replacement approved for rejected items"
            : "Rejected quantity cancelled",
          source,
          [unlinked("RDR", row.entityId)],
          text(details.note),
        );
        return;
      case "delivery.receive-return":
        add("return_received", "Rejected items returned to the stockroom", source, [
          unlinked("RDR", Number(details.internalDiscrepancyId)),
        ]);
        return;
      case "delivery.inspect-return": {
        const returned = discrepancies.find((item) => item.returnLineId === row.entityId);

        add(
          "return_inspected",
          details.result === "uncertain"
            ? "Returned items inspected and kept on hold"
            : `Returned items inspected as ${text(details.result) ?? "checked"}`,
          source,
          returned ? [unlinked("RDR", returned.internalDiscrepancyId)] : [],
        );
        return;
      }
      case "purchase_requisition.create":
        add("pr_created", "Shortage purchase request raised", source, [
          purchaseRequisitionRecord(row.entityId),
        ]);
        return;
      case "supplier_receipt.receive": {
        const receipt = supplierReceipts.find((item) => item.supplierReceiptId === row.entityId);

        if (receipt) {
          add(
            "supplier_receipt",
            `Supplier delivery received on delivery receipt ${receipt.deliveryReceiptNo}`,
            source,
            [purchaseOrderRecord(receipt.purchaseOrderId)],
          );
        }

        return;
      }
    }

    if (row.entityType === "purchase_orders" && row.action in PURCHASE_ORDER_EVENTS) {
      add(
        ...PURCHASE_ORDER_EVENTS[row.action],
        source,
        [purchaseOrderRecord(row.entityId)],
        PO_NOTE_ROLES.includes(viewer.role) ? text(details.reason) : null,
      );
      return;
    }

    if (row.action in SDR_EVENTS) {
      const report = supplierDiscrepancies.find(
        (item) => item.supplierDiscrepancyId === row.entityId,
      );

      add(
        ...SDR_EVENTS[row.action],
        source,
        [
          unlinked("SDR", row.entityId),
          ...(report ? [purchaseOrderRecord(report.purchaseOrderId)] : []),
        ],
        SDR_NOTE_ROLES.includes(viewer.role)
          ? (text(details.problem) ?? text(details.note))
          : null,
      );
    }
  }

  audit.forEach(addAuditEvent);

  for (const row of arrivals) {
    add(
      "stock_arrived",
      `Stock arrived on delivery receipt ${row.deliveryReceiptNo}; the request can be checked again`,
      { occurredAt: row.occurredAt, actorName: row.actorName, sequence: row.auditId },
      [purchaseOrderRecord(row.purchaseOrderId)],
    );
  }

  return events
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.sequence - b.sequence,
    )
    .map(({ key, kind, occurredAt, title, actorName, note, records }) => ({
      key,
      kind,
      occurredAt,
      title,
      actorName,
      note,
      records,
    }));
}
