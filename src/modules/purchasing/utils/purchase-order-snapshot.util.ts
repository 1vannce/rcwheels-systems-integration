import type {
  PurchaseOrderSnapshot,
  PurchaseOrderSnapshotLine,
  SupplierDto,
} from "../types/purchasing.dto";
import { moneyToCents, quantityToThousandths } from "./money.util";

/** Returns a normalized, deterministic snapshot of a PO version. */
export function buildPurchaseOrderSnapshot(input: {
  supplier: SupplierDto;
  deliveryTerms: string | null;
  lines: PurchaseOrderSnapshotLine[];
}): PurchaseOrderSnapshot {
  const lines = [...input.lines]
    .sort((a, b) => a.purchaseRequisitionLineId - b.purchaseRequisitionLineId)
    .map((line) => ({
      purchaseRequisitionLineId: line.purchaseRequisitionLineId,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      orderedQty: line.orderedQty,
      unitPrice: line.unitPrice,
    }));

  return {
    supplier: {
      supplierId: input.supplier.supplierId,
      supplierName: input.supplier.supplierName,
      contactPerson: input.supplier.contactPerson,
      contactDetails: input.supplier.contactDetails,
      address: input.supplier.address,
    },
    deliveryTerms: input.deliveryTerms,
    lines,
  };
}

/** Serializes a PO snapshot for `purchase_order_revisions.snapshot`. */
export function serializePurchaseOrderSnapshot(input: {
  supplier: SupplierDto;
  deliveryTerms: string | null;
  lines: PurchaseOrderSnapshotLine[];
}): string {
  return JSON.stringify(buildPurchaseOrderSnapshot(input));
}

function isSnapshotLine(value: unknown): value is PurchaseOrderSnapshotLine {
  if (!value || typeof value !== "object") {
    return false;
  }

  const line = value as Partial<PurchaseOrderSnapshotLine>;

  if (
    typeof line.purchaseRequisitionLineId !== "number" ||
    typeof line.itemId !== "number" ||
    typeof line.itemCode !== "string" ||
    typeof line.itemName !== "string" ||
    typeof line.unit !== "string" ||
    typeof line.orderedQty !== "string" ||
    typeof line.unitPrice !== "string"
  ) {
    return false;
  }

  try {
    quantityToThousandths(line.orderedQty);
    moneyToCents(line.unitPrice);
  } catch {
    return false;
  }

  return true;
}

function isSnapshot(value: unknown): value is PurchaseOrderSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<PurchaseOrderSnapshot>;

  if (!snapshot.supplier || typeof snapshot.supplier !== "object") {
    return false;
  }

  if (
    typeof snapshot.supplier.supplierId !== "number" ||
    typeof snapshot.supplier.supplierName !== "string"
  ) {
    return false;
  }

  if (
    snapshot.deliveryTerms !== null &&
    typeof snapshot.deliveryTerms !== "string"
  ) {
    return false;
  }

  return Array.isArray(snapshot.lines) && snapshot.lines.every(isSnapshotLine);
}

/**
 * Parses a stored snapshot for display. Malformed JSON or an unexpected shape
 * returns null so one bad revision cannot break the review screen.
 */
export function tryParsePurchaseOrderSnapshot(
  snapshot: string,
): PurchaseOrderSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(snapshot);

    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
