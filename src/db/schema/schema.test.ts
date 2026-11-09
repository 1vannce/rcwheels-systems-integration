import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "./index";

const expectedTables = [
  "acknowledgement_receipts",
  "audit_log",
  "dispatches",
  "dispatch_lines",
  "document_attachments",
  "internal_discrepancies",
  "items",
  "notifications",
  "purchase_order_lines",
  "purchase_order_revisions",
  "purchase_orders",
  "purchase_requisition_lines",
  "purchase_requisitions",
  "requisition_lines",
  "requisition_status_history",
  "requisitions",
  "return_lines",
  "returns",
  "roles",
  "stock_adjustments",
  "stock_balances",
  "stock_movements",
  "stock_reservations",
  "supplier_commitments",
  "supplier_discrepancies",
  "supplier_receipt_lines",
  "supplier_receipts",
  "suppliers",
  "users",
].sort();

function tableNames(): string[] {
  return Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableName(table as PgTable))
    .sort();
}

describe("database schema", () => {
  it("loads despite cross-file foreign keys", () => {
    expect(tableNames().length).toBeGreaterThan(0);
  });

  it("defines all 29 tables from the ERD", () => {
    expect(tableNames()).toEqual(expectedTables);
  });
});
