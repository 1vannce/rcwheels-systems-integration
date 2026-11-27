import "server-only";

import type { Tx } from "@/db";
import { supplierReceiptLines, supplierReceipts } from "@/db/schema";

// Drizzle queries for supplier receipts only: no business rules, and every
// function takes the caller's transaction.

/** Records the delivery header against a PO and returns its ID. */
export async function insertSupplierReceipt(
  tx: Tx,
  input: {
    purchaseOrderId: number;
    receivedBy: number;
    deliveryReceiptNo: string;
    invoiceNo: string | null;
  },
): Promise<number> {
  const [row] = await tx
    .insert(supplierReceipts)
    .values(input)
    .returning({ supplierReceiptId: supplierReceipts.supplierReceiptId });

  return row.supplierReceiptId;
}

/** Records the inspected lines of one receipt, in the given order. */
export async function insertSupplierReceiptLines(
  tx: Tx,
  supplierReceiptId: number,
  lines: readonly {
    purchaseOrderLineId: number;
    deliveredQty: string;
    acceptedQty: string;
    rejectedQty: string;
    inspectionNotes: string | null;
  }[],
): Promise<{ supplierReceiptLineId: number; purchaseOrderLineId: number; acceptedQty: string }[]> {
  if (lines.length === 0) {
    return [];
  }

  return tx
    .insert(supplierReceiptLines)
    .values(lines.map((line) => ({ ...line, supplierReceiptId })))
    .returning({
      supplierReceiptLineId: supplierReceiptLines.supplierReceiptLineId,
      purchaseOrderLineId: supplierReceiptLines.purchaseOrderLineId,
      acceptedQty: supplierReceiptLines.acceptedQty,
    });
}

