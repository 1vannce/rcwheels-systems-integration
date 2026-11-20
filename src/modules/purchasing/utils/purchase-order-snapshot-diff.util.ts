import type {
  PurchaseOrderSnapshot,
  PurchaseOrderSnapshotDiff,
  PurchaseOrderSnapshotLine,
  PurchaseOrderSnapshotLineChange,
} from "../types/purchasing.dto";
import { moneyToCents, quantityToThousandths } from "./money.util";

function lineChange(
  change: "added" | "removed" | "changed",
  previous: PurchaseOrderSnapshotLine | null,
  current: PurchaseOrderSnapshotLine | null,
): PurchaseOrderSnapshotLineChange {
  const source = current ?? previous;

  if (!source) {
    throw new Error("A line change needs a previous or current line.");
  }

  return {
    purchaseRequisitionLineId: source.purchaseRequisitionLineId,
    itemCode: source.itemCode,
    itemName: source.itemName,
    unit: source.unit,
    change,
    previousOrderedQty: previous?.orderedQty ?? null,
    orderedQty: current?.orderedQty ?? null,
    previousUnitPrice: previous?.unitPrice ?? null,
    unitPrice: current?.unitPrice ?? null,
  };
}

function sameQuantity(left: string, right: string): boolean {
  return quantityToThousandths(left) === quantityToThousandths(right);
}

function sameMoney(left: string, right: string): boolean {
  return moneyToCents(left) === moneyToCents(right);
}

/**
 * Compares two stored PO versions. Quantities and prices are compared by value,
 * so "2" and "2.000" do not count as a change. Supplier contact details are not
 * part of the comparison; only the supplier identity is.
 */
export function diffPurchaseOrderSnapshots(
  previous: PurchaseOrderSnapshot,
  current: PurchaseOrderSnapshot,
): PurchaseOrderSnapshotDiff {
  const previousLines = new Map(
    previous.lines.map((line) => [line.purchaseRequisitionLineId, line]),
  );
  const currentLines = new Map(
    current.lines.map((line) => [line.purchaseRequisitionLineId, line]),
  );
  const ids = [
    ...new Set([...previousLines.keys(), ...currentLines.keys()]),
  ].sort((a, b) => a - b);

  const lineChanges: PurchaseOrderSnapshotLineChange[] = [];

  for (const id of ids) {
    const before = previousLines.get(id) ?? null;
    const after = currentLines.get(id) ?? null;

    if (!before && after) {
      lineChanges.push(lineChange("added", null, after));
      continue;
    }

    if (before && !after) {
      lineChanges.push(lineChange("removed", before, null));
      continue;
    }

    if (
      before &&
      after &&
      (!sameQuantity(before.orderedQty, after.orderedQty) ||
        !sameMoney(before.unitPrice, after.unitPrice))
    ) {
      lineChanges.push(lineChange("changed", before, after));
    }
  }

  const supplierChanged =
    previous.supplier.supplierId !== current.supplier.supplierId ||
    previous.supplier.supplierName !== current.supplier.supplierName;
  const deliveryTermsChanged = previous.deliveryTerms !== current.deliveryTerms;

  return {
    supplierChanged,
    previousSupplierName: previous.supplier.supplierName,
    supplierName: current.supplier.supplierName,
    deliveryTermsChanged,
    previousDeliveryTerms: previous.deliveryTerms,
    deliveryTerms: current.deliveryTerms,
    lineChanges,
    hasChanges:
      supplierChanged || deliveryTermsChanged || lineChanges.length > 0,
  };
}
