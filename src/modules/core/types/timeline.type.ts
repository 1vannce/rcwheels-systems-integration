export type TimelineEventKind =
  | "created"
  | "resubmitted"
  | "approved"
  | "rejected"
  | "reserved"
  | "awaiting_stock"
  | "pr_created"
  | "po_created"
  | "po_revised"
  | "po_returned"
  | "po_approved"
  | "po_placed"
  | "po_discarded"
  | "po_balance_cancelled"
  | "supplier_receipt"
  | "po_partially_received"
  | "po_closed"
  | "sdr_opened"
  | "sdr_updated"
  | "sdr_agreed"
  | "sdr_resolved"
  | "stock_arrived"
  | "ar_prepared"
  | "dispatched"
  | "delivery_decided"
  | "rdr_opened"
  | "return_received"
  | "return_inspected"
  | "rdr_resolved"
  | "cancelled"
  | "delivered"
  | "fulfilled";

/** A document an event is about. `href` is null when the viewer cannot open it. */
export type TimelineRecord = { number: string; href: string | null };

export type TimelineEvent = {
  /** Unique within one timeline. */
  key: string;
  kind: TimelineEventKind;
  occurredAt: Date;
  title: string;
  /** Null for system actions. */
  actorName: string | null;
  note: string | null;
  records: TimelineRecord[];
};
