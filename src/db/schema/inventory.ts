// Inventory: items, stock_balances, stock_reservations, stock_movements, stock_adjustments

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
  adjustmentStatusEnum,
  movementTypeEnum,
  reservationStatusEnum,
  stockConditionEnum,
} from "./enums";
import { dispatchLines, requisitionLines } from "./requisition";
import { returnLines, supplierReceiptLines } from "./delivery";

export const items = pgTable("items", {
  itemId: serial("item_id").primaryKey(),
  itemCode: text("item_code").notNull().unique("items_item_code_unique"),
  itemName: text("item_name").notNull(),
  specification: text("specification").notNull(),
  unit: text("unit").notNull(),
  reorderPoint: numeric("reorder_point", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  averageCost: numeric("average_cost", { precision: 12, scale: 4 })
    .notNull()
    .default("0"),
}).enableRLS();

export const stockBalances = pgTable(
  "stock_balances",
  {
    stockBalanceId: serial("stock_balance_id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.itemId),
    condition: stockConditionEnum("condition").notNull(),
    quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    isIncomplete: boolean("is_incomplete").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("stock_balances_item_condition_unique").on(t.itemId, t.condition),
  ],
).enableRLS();

export const stockReservations = pgTable(
  "stock_reservations",
  {
    reservationId: serial("reservation_id").primaryKey(),
    requisitionLineId: integer("requisition_line_id")
      .notNull()
      .references((): AnyPgColumn => requisitionLines.requisitionLineId),
    stockBalanceId: integer("stock_balance_id")
      .notNull()
      .references(() => stockBalances.stockBalanceId),
    reservedQty: numeric("reserved_qty", { precision: 14, scale: 3 }).notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_reservations_requisition_line_idx").on(t.requisitionLineId),
    index("stock_reservations_stock_balance_idx").on(t.stockBalanceId),
    index("stock_reservations_status_idx").on(t.status),
  ],
).enableRLS();

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    adjustmentId: serial("adjustment_id").primaryKey(),
    stockBalanceId: integer("stock_balance_id")
      .notNull()
      .references(() => stockBalances.stockBalanceId),
    countedBy: integer("counted_by")
      .notNull()
      .references(() => users.userId),
    approvedBy: integer("approved_by").references(() => users.userId),
    recordedQty: numeric("recorded_qty", { precision: 14, scale: 3 }).notNull(),
    countedQty: numeric("counted_qty", { precision: 14, scale: 3 }).notNull(),
    reason: text("reason").notNull(),
    status: adjustmentStatusEnum("status").notNull().default("pending"),
    countedAt: timestamp("counted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_adjustments_stock_balance_idx").on(t.stockBalanceId),
    index("stock_adjustments_status_idx").on(t.status),
  ],
).enableRLS();

export const stockMovements = pgTable(
  "stock_movements",
  {
    movementId: serial("movement_id").primaryKey(),
    stockBalanceId: integer("stock_balance_id")
      .notNull()
      .references(() => stockBalances.stockBalanceId),
    movementType: movementTypeEnum("movement_type").notNull(),
    supplierReceiptLineId: integer("supplier_receipt_line_id").references(
      (): AnyPgColumn => supplierReceiptLines.supplierReceiptLineId,
    ),
    dispatchLineId: integer("dispatch_line_id").references(
      (): AnyPgColumn => dispatchLines.dispatchLineId,
    ),
    returnLineId: integer("return_line_id").references(
      (): AnyPgColumn => returnLines.returnLineId,
    ),
    adjustmentId: integer("adjustment_id").references(
      () => stockAdjustments.adjustmentId,
    ),
    reversesMovementId: integer("reverses_movement_id").references(
      (): AnyPgColumn => stockMovements.movementId,
    ),
    quantityDelta: numeric("quantity_delta", {
      precision: 14,
      scale: 3,
    }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
    // Unique source reference: the same event can never post twice.
    eventKey: text("event_key").notNull().unique("stock_movements_event_key_unique"),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stock_movements_stock_balance_idx").on(t.stockBalanceId),
    index("stock_movements_movement_type_idx").on(t.movementType),
    uniqueIndex("stock_movements_reverses_movement_unique").on(
      t.reversesMovementId,
    ),
  ],
).enableRLS();
