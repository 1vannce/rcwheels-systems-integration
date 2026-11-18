import { expect, it } from "vitest";

import { CreateShortagePurchaseRequisitionDto } from "./purchase-requisition.dto";

it("accepts a requisition with unique positive lines", () => {
  const result = CreateShortagePurchaseRequisitionDto.safeParse({
    requisitionId: "4",
    lines: [
      { requisitionLineId: "10", requestedQty: "2.5" },
      { requisitionLineId: "11", requestedQty: "1" },
    ],
  });

  expect(result.success).toBe(true);
});

it("refuses a zero or negative quantity", () => {
  for (const requestedQty of ["0", "-1"]) {
    const result = CreateShortagePurchaseRequisitionDto.safeParse({
      requisitionId: "4",
      lines: [{ requisitionLineId: "10", requestedQty }],
    });

    expect(result.success).toBe(false);
  }
});

it("refuses duplicate requisition lines", () => {
  const result = CreateShortagePurchaseRequisitionDto.safeParse({
    requisitionId: "4",
    lines: [
      { requisitionLineId: "10", requestedQty: "1" },
      { requisitionLineId: "10", requestedQty: "2" },
    ],
  });

  expect(result.success).toBe(false);
});

it("refuses an empty line list", () => {
  const result = CreateShortagePurchaseRequisitionDto.safeParse({
    requisitionId: "4",
    lines: [],
  });

  expect(result.success).toBe(false);
});
