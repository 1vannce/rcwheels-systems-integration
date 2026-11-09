// Supplier receiving and internal delivery: receipts, discrepancies, returns

import {
  date,
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
import {
  internalDiscrepancyStatusEnum,
  stockConditionEnum,
  supplierDiscrepancyStatusEnum,
} from "./enums";
import { purchaseOrderLines, purchaseOrders } from "./purchasing";
import { dispatchLines } from "./requisition";

export const supplierReceipts = pgTable(
  "supplier_receipts",
  {
    supplierReceiptId: serial("supplier_receipt_id").primaryKey(),
    purchaseOrderId: integer("purchase_order_id")
      .notNull()
      .references((): AnyPgColumn => purchaseOrders.purchaseOrderId),
    receivedBy: integer("received_by")
      .notNull()
      .references(() => users.userId),
    deliveryReceiptNo: text("delivery_receipt_no").notNull(),
    invoiceNo: text("invoice_no"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (t) => [
    index("supplier_receipts_purchase_order_idx").on(t.purchaseOrderId),
    index("supplier_receipts_received_by_idx").on(t.receivedBy),
  ],
);

export const supplierReceiptLines = pgTable(
  "supplier_receipt_lines",
  {
    supplierReceiptLineId: serial("supplier_receipt_line_id").primaryKey(),
    supplierReceiptId: integer("supplier_receipt_id")
      .notNull()
      .references(() => supplierReceipts.supplierReceiptId),
    purchaseOrderLineId: integer("purchase_order_line_id")
      .notNull()
      .references((): AnyPgColumn => purchaseOrderLines.purchaseOrderLineId),
    deliveredQty: numeric("delivered_qty", { precision: 14, scale: 3 }).notNull(),
    acceptedQty: numeric("accepted_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    rejectedQty: numeric("rejected_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    inspectionNotes: text("inspection_notes"),
  },
  (t) => [
    index("supplier_receipt_lines_supplier_receipt_idx").on(t.supplierReceiptId),
    index("supplier_receipt_lines_purchase_order_line_idx").on(
      t.purchaseOrderLineId,
    ),
  ],
);

export const supplierDiscrepancies = pgTable(
  "supplier_discrepancies",
  {
    supplierDiscrepancyId: serial("supplier_discrepancy_id").primaryKey(),
    purchaseOrderLineId: integer("purchase_order_line_id")
      .notNull()
      .references((): AnyPgColumn => purchaseOrderLines.purchaseOrderLineId),
    // Blank when the discrepancy is about items that never arrived.
    supplierReceiptLineId: integer("supplier_receipt_line_id").references(
      () => supplierReceiptLines.supplierReceiptLineId,
    ),
    reportedBy: integer("reported_by")
      .notNull()
      .references(() => users.userId),
    problem: text("problem").notNull(),
    affectedQty: numeric("affected_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    resolutionAction: text("resolution_action"),
    status: supplierDiscrepancyStatusEnum("status").notNull().default("open"),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("supplier_discrepancies_purchase_order_line_idx").on(
      t.purchaseOrderLineId,
    ),
    index("supplier_discrepancies_receipt_line_idx").on(t.supplierReceiptLineId),
    index("supplier_discrepancies_status_idx").on(t.status),
  ],
);

export const supplierCommitments = pgTable(
  "supplier_commitments",
  {
    commitmentId: serial("commitment_id").primaryKey(),
    supplierDiscrepancyId: integer("supplier_discrepancy_id")
      .notNull()
      .references(() => supplierDiscrepancies.supplierDiscrepancyId),
    agreedAction: text("agreed_action").notNull(),
    committedQty: numeric("committed_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    expectedDeliveryDate: date("expected_delivery_date", {
      mode: "date",
    }).notNull(),
    status: text("status").notNull().default("open"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("supplier_commitments_discrepancy_idx").on(t.supplierDiscrepancyId),
  ],
);

export const internalDiscrepancies = pgTable(
  "internal_discrepancies",
  {
    internalDiscrepancyId: serial("internal_discrepancy_id").primaryKey(),
    dispatchLineId: integer("dispatch_line_id")
      .notNull()
      .references((): AnyPgColumn => dispatchLines.dispatchLineId),
    reportedBy: integer("reported_by")
      .notNull()
      .references(() => users.userId),
    resolvedBy: integer("resolved_by").references(() => users.userId),
    affectedQty: numeric("affected_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    problem: text("problem").notNull(),
    resolutionAction: text("resolution_action"),
    status: internalDiscrepancyStatusEnum("status")
      .notNull()
      .default("pending_resolution"),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("internal_discrepancies_dispatch_line_idx").on(t.dispatchLineId),
    index("internal_discrepancies_status_idx").on(t.status),
  ],
);

export const returns = pgTable(
  "returns",
  {
    returnId: serial("return_id").primaryKey(),
    internalDiscrepancyId: integer("internal_discrepancy_id")
      .notNull()
      .references(() => internalDiscrepancies.internalDiscrepancyId),
    receivedBy: integer("received_by")
      .notNull()
      .references(() => users.userId),
    returnedAt: timestamp("returned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("pending_inspection"),
  },
  (t) => [
    index("returns_internal_discrepancy_idx").on(t.internalDiscrepancyId),
    index("returns_status_idx").on(t.status),
  ],
);

export const returnLines = pgTable(
  "return_lines",
  {
    returnLineId: serial("return_line_id").primaryKey(),
    returnId: integer("return_id")
      .notNull()
      .references(() => returns.returnId),
    dispatchLineId: integer("dispatch_line_id")
      .notNull()
      .references((): AnyPgColumn => dispatchLines.dispatchLineId),
    returnedQty: numeric("returned_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    condition: stockConditionEnum("condition").notNull(),
    inspectedAt: timestamp("inspected_at", { withTimezone: true }),
  },
  (t) => [
    index("return_lines_return_idx").on(t.returnId),
    index("return_lines_dispatch_line_idx").on(t.dispatchLineId),
  ],
);
