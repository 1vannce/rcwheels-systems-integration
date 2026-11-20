import { expect, it } from "vitest";

import type {
  PurchaseOrderSnapshot,
  PurchaseOrderSnapshotLine,
} from "../types/purchasing.dto";
import { diffPurchaseOrderSnapshots } from "./purchase-order-snapshot-diff.util";

const supplier = {
  supplierId: 4,
  supplierName: "Sugbo Tire Trading",
  contactPerson: "Elena Ramos",
  contactDetails: "elena@sugbotire.test",
  address: "Mandaue City, Cebu",
};

function line(
  purchaseRequisitionLineId: number,
  overrides: Partial<PurchaseOrderSnapshotLine> = {},
): PurchaseOrderSnapshotLine {
  return {
    purchaseRequisitionLineId,
    itemId: purchaseRequisitionLineId + 100,
    itemCode: `ITEM-${purchaseRequisitionLineId}`,
    itemName: `Item ${purchaseRequisitionLineId}`,
    unit: "pc",
    orderedQty: "2",
    unitPrice: "1500.00",
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<PurchaseOrderSnapshot> = {},
): PurchaseOrderSnapshot {
  return {
    supplier,
    deliveryTerms: null,
    lines: [line(10)],
    ...overrides,
  };
}

it("reports no changes for identical versions", () => {
  const diff = diffPurchaseOrderSnapshots(snapshot(), snapshot());

  expect(diff.hasChanges).toBe(false);
  expect(diff.lineChanges).toEqual([]);
  expect(diff.supplierChanged).toBe(false);
  expect(diff.deliveryTermsChanged).toBe(false);
});

it("reports a supplier change", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot(),
    snapshot({
      supplier: { ...supplier, supplierId: 9, supplierName: "Cebu Parts Depot" },
    }),
  );

  expect(diff.hasChanges).toBe(true);
  expect(diff.supplierChanged).toBe(true);
  expect(diff.previousSupplierName).toBe("Sugbo Tire Trading");
  expect(diff.supplierName).toBe("Cebu Parts Depot");
});

it("reports a supplier name change with the same ID", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot(),
    snapshot({
      supplier: { ...supplier, supplierName: "Sugbo Tire Trading Co." },
    }),
  );

  expect(diff.supplierChanged).toBe(true);
  expect(diff.previousSupplierName).toBe("Sugbo Tire Trading");
  expect(diff.supplierName).toBe("Sugbo Tire Trading Co.");
});

it("reports a delivery-terms change", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot({ deliveryTerms: null }),
    snapshot({ deliveryTerms: "Deliver to Bay 2" }),
  );

  expect(diff.deliveryTermsChanged).toBe(true);
  expect(diff.previousDeliveryTerms).toBeNull();
  expect(diff.deliveryTerms).toBe("Deliver to Bay 2");
});

it("reports a quantity change", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot(),
    snapshot({ lines: [line(10, { orderedQty: "3" })] }),
  );

  expect(diff.hasChanges).toBe(true);
  expect(diff.lineChanges).toEqual([
    {
      purchaseRequisitionLineId: 10,
      itemCode: "ITEM-10",
      itemName: "Item 10",
      unit: "pc",
      change: "changed",
      previousOrderedQty: "2",
      orderedQty: "3",
      previousUnitPrice: "1500.00",
      unitPrice: "1500.00",
    },
  ]);
});

it("reports a price change", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot(),
    snapshot({ lines: [line(10, { unitPrice: "1600.00" })] }),
  );

  expect(diff.lineChanges).toHaveLength(1);
  expect(diff.lineChanges[0]).toMatchObject({
    change: "changed",
    previousUnitPrice: "1500.00",
    unitPrice: "1600.00",
  });
});

it("reports an added line", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot(),
    snapshot({ lines: [line(10), line(11)] }),
  );

  expect(diff.lineChanges).toEqual([
    {
      purchaseRequisitionLineId: 11,
      itemCode: "ITEM-11",
      itemName: "Item 11",
      unit: "pc",
      change: "added",
      previousOrderedQty: null,
      orderedQty: "2",
      previousUnitPrice: null,
      unitPrice: "1500.00",
    },
  ]);
});

it("reports a removed line", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot({ lines: [line(10), line(11)] }),
    snapshot({ lines: [line(10)] }),
  );

  expect(diff.lineChanges).toEqual([
    {
      purchaseRequisitionLineId: 11,
      itemCode: "ITEM-11",
      itemName: "Item 11",
      unit: "pc",
      change: "removed",
      previousOrderedQty: "2",
      orderedQty: null,
      previousUnitPrice: "1500.00",
      unitPrice: null,
    },
  ]);
});

it("compares quantities and prices by value, not by string form", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot({ lines: [line(10, { orderedQty: "2", unitPrice: "1500" })] }),
    snapshot({
      lines: [line(10, { orderedQty: "2.000", unitPrice: "1500.00" })],
    }),
  );

  expect(diff.hasChanges).toBe(false);
  expect(diff.lineChanges).toEqual([]);
});

it("orders line changes by purchase request line", () => {
  const diff = diffPurchaseOrderSnapshots(
    snapshot({ lines: [line(10), line(12)] }),
    snapshot({
      lines: [line(13), line(12, { orderedQty: "5" }), line(10)],
    }),
  );

  expect(diff.lineChanges.map((entry) => entry.purchaseRequisitionLineId)).toEqual([
    12, 13,
  ]);
});
