import { expect, it } from "vitest";

import type { PurchaseOrderSnapshotLine, SupplierDto } from "../types/purchasing.dto";
import {
  buildPurchaseOrderSnapshot,
  serializePurchaseOrderSnapshot,
  tryParsePurchaseOrderSnapshot,
} from "./purchase-order-snapshot.util";

const supplier: SupplierDto = {
  supplierId: 4,
  supplierName: "Sugbo Tire Trading",
  contactPerson: "Elena Ramos",
  contactDetails: "elena@sugbotire.test",
  address: "Mandaue City, Cebu",
};

function line(
  purchaseRequisitionLineId: number,
  orderedQty = "2",
): PurchaseOrderSnapshotLine {
  return {
    purchaseRequisitionLineId,
    itemId: purchaseRequisitionLineId + 100,
    itemCode: `ITEM-${purchaseRequisitionLineId}`,
    itemName: `Item ${purchaseRequisitionLineId}`,
    unit: "pc",
    orderedQty,
    unitPrice: "1500.00",
  };
}

it("stores the supplier, terms, and lines", () => {
  const snapshot = buildPurchaseOrderSnapshot({
    supplier,
    deliveryTerms: null,
    lines: [line(10)],
  });

  expect(snapshot).toEqual({
    supplier,
    deliveryTerms: null,
    lines: [
      {
        purchaseRequisitionLineId: 10,
        itemId: 110,
        itemCode: "ITEM-10",
        itemName: "Item 10",
        unit: "pc",
        orderedQty: "2",
        unitPrice: "1500.00",
      },
    ],
  });
});

it("sorts lines by purchase request line for a deterministic snapshot", () => {
  const first = serializePurchaseOrderSnapshot({
    supplier,
    deliveryTerms: "Deliver to Bay 2",
    lines: [line(12), line(10), line(11)],
  });
  const second = serializePurchaseOrderSnapshot({
    supplier,
    deliveryTerms: "Deliver to Bay 2",
    lines: [line(11), line(12), line(10)],
  });

  expect(first).toBe(second);
  expect((JSON.parse(first) as { lines: { purchaseRequisitionLineId: number }[] }).lines.map(
    (entry) => entry.purchaseRequisitionLineId,
  )).toEqual([10, 11, 12]);
});

it("does not mutate the caller's line array", () => {
  const lines = [line(12), line(10)];

  buildPurchaseOrderSnapshot({ supplier, deliveryTerms: null, lines });

  expect(lines.map((entry) => entry.purchaseRequisitionLineId)).toEqual([12, 10]);
});

it("parses a stored snapshot", () => {
  const snapshot = serializePurchaseOrderSnapshot({
    supplier,
    deliveryTerms: null,
    lines: [line(10)],
  });

  expect(tryParsePurchaseOrderSnapshot(snapshot)).toEqual(
    JSON.parse(snapshot) as unknown,
  );
});

it("returns null for malformed JSON", () => {
  expect(tryParsePurchaseOrderSnapshot("{not json")).toBeNull();
});

it("returns null for JSON with an unexpected shape", () => {
  expect(tryParsePurchaseOrderSnapshot(JSON.stringify({ lines: [] }))).toBeNull();
  expect(
    tryParsePurchaseOrderSnapshot(
      JSON.stringify({ supplier: { supplierId: 4 }, deliveryTerms: null, lines: [] }),
    ),
  ).toBeNull();
});

it("returns null for snapshots with invalid quantities or prices", () => {
  expect(
    tryParsePurchaseOrderSnapshot(
      JSON.stringify({
        supplier,
        deliveryTerms: null,
        lines: [{ ...line(10), orderedQty: "not-a-quantity" }],
      }),
    ),
  ).toBeNull();
  expect(
    tryParsePurchaseOrderSnapshot(
      JSON.stringify({
        supplier,
        deliveryTerms: null,
        lines: [{ ...line(10), unitPrice: "1.001" }],
      }),
    ),
  ).toBeNull();
});
