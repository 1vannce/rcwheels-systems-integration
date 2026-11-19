import type {
  PurchaseOrderSnapshot,
  PurchaseOrderSnapshotLine,
  SupplierDto,
} from "../types/purchasing.dto";

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
