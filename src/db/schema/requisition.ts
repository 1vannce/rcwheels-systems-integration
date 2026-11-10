// Requisition and issue: requisitions, lines, status history, dispatch and AR

import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { users } from "./core";
import { requisitionStatusEnum } from "./enums";
import { items } from "./inventory";

export const requisitions = pgTable(
  "requisitions",
  {
    requisitionId: serial("requisition_id").primaryKey(),
    submittedBy: integer("submitted_by")
      .notNull()
      .references(() => users.userId),
    // Kept for requests submitted on behalf of a mechanic.
    requesterName: text("requester_name").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isUrgent: boolean("is_urgent").notNull().default(false),
    purpose: text("purpose").notNull(),
    status: requisitionStatusEnum("status").notNull().default("pending_approval"),
  },
  (t) => [
    index("requisitions_submitted_by_idx").on(t.submittedBy),
    index("requisitions_status_idx").on(t.status),
  ],
);

export const requisitionLines = pgTable(
  "requisition_lines",
  {
    requisitionLineId: serial("requisition_line_id").primaryKey(),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.requisitionId),
    itemId: integer("item_id")
      .notNull()
      .references((): AnyPgColumn => items.itemId),
    requestedQty: numeric("requested_qty", { precision: 14, scale: 3 }).notNull(),
    approvedQty: numeric("approved_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    cancelledQty: numeric("cancelled_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
  },
  (t) => [
    index("requisition_lines_requisition_idx").on(t.requisitionId),
    index("requisition_lines_item_idx").on(t.itemId),
  ],
);

export const requisitionStatusHistory = pgTable(
  "requisition_status_history",
  {
    historyId: serial("history_id").primaryKey(),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.requisitionId),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => users.userId),
    // Null on the first submission, which has no previous status.
    fromStatus: requisitionStatusEnum("from_status"),
    toStatus: requisitionStatusEnum("to_status").notNull(),
    reason: text("reason"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("requisition_status_history_requisition_idx").on(t.requisitionId),
    index("requisition_status_history_changed_at_idx").on(t.changedAt),
  ],
);

export const dispatches = pgTable(
  "dispatches",
  {
    dispatchId: serial("dispatch_id").primaryKey(),
    requisitionId: integer("requisition_id")
      .notNull()
      .references(() => requisitions.requisitionId),
    dispatchedBy: integer("dispatched_by")
      .notNull()
      .references(() => users.userId),
    deliveryPersonnel: text("delivery_personnel").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("dispatched"),
  },
  (t) => [
    index("dispatches_requisition_idx").on(t.requisitionId),
    index("dispatches_status_idx").on(t.status),
  ],
);

export const dispatchLines = pgTable(
  "dispatch_lines",
  {
    dispatchLineId: serial("dispatch_line_id").primaryKey(),
    dispatchId: integer("dispatch_id")
      .notNull()
      .references(() => dispatches.dispatchId),
    requisitionLineId: integer("requisition_line_id")
      .notNull()
      .references(() => requisitionLines.requisitionLineId),
    sentQty: numeric("sent_qty", { precision: 14, scale: 3 }).notNull(),
    acceptedQty: numeric("accepted_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
  },
  (t) => [
    index("dispatch_lines_dispatch_idx").on(t.dispatchId),
    index("dispatch_lines_requisition_line_idx").on(t.requisitionLineId),
  ],
);

export const acknowledgementReceipts = pgTable(
  "acknowledgement_receipts",
  {
    acknowledgementReceiptId: serial("acknowledgement_receipt_id").primaryKey(),
    dispatchId: integer("dispatch_id")
      .notNull()
      .unique("acknowledgement_receipts_dispatch_unique")
      .references(() => dispatches.dispatchId),
    preparedBy: integer("prepared_by")
      .notNull()
      .references(() => users.userId),
    preparedAt: timestamp("prepared_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Blank until the requester accepts the items.
    signedBy: integer("signed_by").references(() => users.userId),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (t) => [index("acknowledgement_receipts_signed_by_idx").on(t.signedBy)],
);
