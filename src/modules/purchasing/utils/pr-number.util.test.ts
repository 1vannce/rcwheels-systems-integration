import { expect, it } from "vitest";

import { formatPrNumber } from "./pr-number.util";

it("formats a purchase requisition number with four digits", () => {
  expect(formatPrNumber(1)).toBe("PR-0001");
  expect(formatPrNumber(42)).toBe("PR-0042");
});

it("keeps numbers wider than four digits", () => {
  expect(formatPrNumber(12345)).toBe("PR-12345");
});
