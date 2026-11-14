import { describe, expect, it } from "vitest";

import {
  compareQuantities,
  formatQuantity,
  isQuantity,
  toThousandths,
} from "./quantity.util";

describe("quantity.util", () => {
  it("validates quantity strings", () => {
    expect(isQuantity("10")).toBe(true);
    expect(isQuantity("10.5")).toBe(true);
    expect(isQuantity("10.500")).toBe(true);
    expect(isQuantity("-5.250")).toBe(true);
    expect(isQuantity("abc")).toBe(false);
    expect(isQuantity("1.2345")).toBe(false);
  });

  it("converts to thousandths accurately without floating point errors", () => {
    expect(toThousandths("10")).toBe(10000);
    expect(toThousandths("10.5")).toBe(10500);
    expect(toThousandths("10.005")).toBe(10005);
    expect(toThousandths("-2.5")).toBe(-2500);
  });

  it("compares quantities correctly", () => {
    expect(compareQuantities("10", "10")).toBe(0);
    expect(compareQuantities("10.000", "10")).toBe(0);
    expect(compareQuantities("10", "2")).toBeGreaterThan(0);
    expect(compareQuantities("2", "10")).toBeLessThan(0);
    expect(compareQuantities("0", "0.001")).toBeLessThan(0);
  });

  it("formats quantities cleanly", () => {
    expect(formatQuantity("10.000")).toBe("10");
    expect(formatQuantity("10.500")).toBe("10.5");
    expect(formatQuantity("10.550")).toBe("10.55");
    expect(formatQuantity("10.555")).toBe("10.555");
  });
});
