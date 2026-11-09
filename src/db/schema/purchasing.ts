// Purchasing: suppliers, purchase requisitions, purchase orders and revisions

import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { users } from "./core";
import {
  purchaseOrderStatusEnum,
  purchaseRequisitionReasonEnum,
  purchaseRequisitionStatusEnum,
} from "./enums";
import { items } from "./inventory";
import { requisitionLines } from "./requisition";

export const suppliers = pgTable("suppliers", {
  supplierId: serial("supplier_id").primaryKey(),
  supplierName: text("supplier_name").notNull(),
  contactPerson: text("contact_person"),
  contactDetails: text("contact_details"),
  address: text("address"),
});

export const purchaseRequisitions = pgTable(
  "purchase_requisitions",
  {
    purchaseRequisitionId: serial("purchase_requisition_id").primaryKey(),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.userId),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestReason: purchaseRequisitionReasonEnum("request_reason").notNull(),
    status: purchaseRequisitionStatusEnum("status").notNull().default("open"),
  },
  (t) => [
    index("purchase_requisitions_requested_by_idx").on(t.requestedBy),
    index("purchase_requisitions_status_idx").on(t.status),
  ],
);

export const purchaseRequisitionLines = pgTable(
  "purchase_requisition_lines",
  {
    purchaseRequisitionLineId: serial("purchase_requisition_line_id").primaryKey(),
    purchaseRequisitionId: integer("purchase_requisition_id")
      .notNull()
      .references(() => purchaseRequisitions.purchaseRequisitionId),
    // Blank for a reorder PR, which is not tied to one requisition line.
    requisitionLineId: integer("requisition_line_id").references(
      (): AnyPgColumn => requisitionLines.requisitionLineId,
    ),
    itemId: integer("item_id")
      .notNull()
      .references((): AnyPgColumn => items.itemId),
    requestedQty: numeric("requested_qty", { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    index("purchase_requisition_lines_purchase_requisition_idx").on(
      t.purchaseRequisitionId,
    ),
    index("purchase_requisition_lines_requisition_line_idx").on(
      t.requisitionLineId,
    ),
    index("purchase_requisition_lines_item_idx").on(t.itemId),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    purchaseOrderId: serial("purchase_order_id").primaryKey(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.supplierId),
    preparedBy: integer("prepared_by")
      .notNull()
      .references(() => users.userId),
    // Blank until Accounting approves the current version.
    approvedBy: integer("approved_by").references(() => users.userId),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    status: purchaseOrderStatusEnum("status").notNull().default("pending_approval"),
    currentVersion: integer("current_version").notNull().default(1),
    deliveryTerms: text("delivery_terms"),
    supplierConfirmedAt: timestamp("supplier_confirmed_at", { withTimezone: true }),
  },
  (t) => [
    index("purchase_orders_supplier_idx").on(t.supplierId),
    index("purchase_orders_prepared_by_idx").on(t.preparedBy),
    index("purchase_orders_status_idx").on(t.status),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    purchaseOrderLineId: serial("purchase_order_line_id").primaryKey(),
    purchaseOrderId: integer("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.purchaseOrderId),
    purchaseRequisitionLineId: integer("purchase_requisition_line_id")
      .notNull()
      .references(() => purchaseRequisitionLines.purchaseRequisitionLineId),
    orderedQty: numeric("ordered_qty", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    cancelledQty: numeric("cancelled_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
  },
  (t) => [
    index("purchase_order_lines_purchase_order_idx").on(t.purchaseOrderId),
    index("purchase_order_lines_purchase_requisition_line_idx").on(
      t.purchaseRequisitionLineId,
    ),
  ],
);

export const purchaseOrderRevisions = pgTable(
  "purchase_order_revisions",
  {
    revisionId: serial("revision_id").primaryKey(),
    purchaseOrderId: integer("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.purchaseOrderId),
    versionNo: integer("version_no").notNull(),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => users.userId),
    reviewedBy: integer("reviewed_by").references(() => users.userId),
    budgetOk: boolean("budget_ok"),
    reviewReason: text("review_reason"),
    // JSON snapshot of the supplier, lines, quantities and prices at this version.
    snapshot: text("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("purchase_order_revisions_order_version_unique").on(
      t.purchaseOrderId,
      t.versionNo,
    ),
    index("purchase_order_revisions_purchase_order_idx").on(t.purchaseOrderId),
  ],
);
