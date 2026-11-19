import { expect, it } from "vitest";

import { formatPoNumber } from "./po-number.util";

it("formats a purchase order number with four digits", () => {
  expect(formatPoNumber(1)).toBe("PO-0001");
  expect(formatPoNumber(42)).toBe("PO-0042");
});

it("keeps numbers wider than four digits", () => {
  expect(formatPoNumber(12345)).toBe("PO-12345");
});
