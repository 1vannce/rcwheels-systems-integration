import { expect, it } from "vitest";

import { CreatePurchaseOrderDto } from "./purchase-order.dto";

it("accepts a PO draft with unique lines and optional delivery terms", () => {
  const result = CreatePurchaseOrderDto.safeParse({
    purchaseRequisitionId: "4",
    supplierId: "2",
    deliveryTerms: "Deliver to the main workshop bay",
    lines: [
      {
        purchaseRequisitionLineId: "10",
        orderedQty: "2.5",
        unitPrice: "1500.25",
      },
      {
        purchaseRequisitionLineId: "11",
        orderedQty: "1",
        unitPrice: "99",
      },
    ],
  });

  expect(result.success).toBe(true);
});

it("turns blank delivery terms into null", () => {
  const result = CreatePurchaseOrderDto.safeParse({
    purchaseRequisitionId: "4",
    supplierId: "2",
    deliveryTerms: "   ",
    lines: [
      {
        purchaseRequisitionLineId: "10",
        orderedQty: "1",
        unitPrice: "10",
      },
    ],
  });

  expect(result.success).toBe(true);
  expect(result.data?.deliveryTerms).toBeNull();
});

it("refuses zero or negative quantities", () => {
  for (const orderedQty of ["0", "-1"]) {
    const result = CreatePurchaseOrderDto.safeParse({
      purchaseRequisitionId: "4",
      supplierId: "2",
      lines: [
        {
          purchaseRequisitionLineId: "10",
          orderedQty,
          unitPrice: "10",
        },
      ],
    });

    expect(result.success).toBe(false);
  }
});

it("refuses zero or negative unit prices", () => {
  for (const unitPrice of ["0", "-1"]) {
    const result = CreatePurchaseOrderDto.safeParse({
      purchaseRequisitionId: "4",
      supplierId: "2",
      lines: [
        {
          purchaseRequisitionLineId: "10",
          orderedQty: "1",
          unitPrice,
        },
      ],
    });

    expect(result.success).toBe(false);
  }
});

it("refuses duplicate purchase request lines", () => {
  const result = CreatePurchaseOrderDto.safeParse({
    purchaseRequisitionId: "4",
    supplierId: "2",
    lines: [
      {
        purchaseRequisitionLineId: "10",
        orderedQty: "1",
        unitPrice: "10",
      },
      {
        purchaseRequisitionLineId: "10",
        orderedQty: "2",
        unitPrice: "20",
      },
    ],
  });

  expect(result.success).toBe(false);
});

it("refuses an empty line list", () => {
  const result = CreatePurchaseOrderDto.safeParse({
    purchaseRequisitionId: "4",
    supplierId: "2",
    lines: [],
  });

  expect(result.success).toBe(false);
});
