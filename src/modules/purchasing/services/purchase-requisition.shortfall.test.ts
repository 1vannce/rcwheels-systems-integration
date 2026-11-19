import { expect, it } from "vitest";

import { calculateUncoveredShortfall } from "./purchase-requisition.shortfall";

it("subtracts committed purchase orders from the unreserved need", () => {
  expect(calculateUncoveredShortfall("10.000", "2.500")).toBe("7.500");
});

it("returns zero when purchase orders cover the need", () => {
  expect(calculateUncoveredShortfall("4.000", "4.000")).toBe("0.000");
});

it("never returns a negative amount when purchase orders exceed the need", () => {
  expect(calculateUncoveredShortfall("2.000", "5.000")).toBe("0.000");
});

it("keeps fractional quantities exact", () => {
  expect(calculateUncoveredShortfall("1.250", "0.125")).toBe("1.125");
});
