import { describe, expect, it } from "vitest";

import {
  addQuantities,
  compareQuantities,
  formatQuantity,
  isQuantity,
  negateQuantity,
  subtractQuantities,
  toThousandths,
} from "./quantity.service";

describe("quantity helpers", () => {
  it("adds and subtracts without floating-point error", () => {
    expect(addQuantities("0.100", "0.200")).toBe("0.300");
    expect(subtractQuantities("1.000", "0.900")).toBe("0.100");
    expect(subtractQuantities("2", "5.5")).toBe("-3.500");
    expect(negateQuantity("4.250")).toBe("-4.250");
  });

  it("compares quantities written with different precision", () => {
    expect(compareQuantities("5", "5.000")).toBe(0);
    expect(compareQuantities("4.999", "5")).toBeLessThan(0);
    expect(compareQuantities("0.001", "0")).toBeGreaterThan(0);
    expect(compareQuantities("-0.500", "0")).toBeLessThan(0);
  });

  it("accepts at most three decimal places", () => {
    expect(isQuantity("12.345")).toBe(true);
    expect(isQuantity("12.3456")).toBe(false);
    expect(isQuantity("1e3")).toBe(false);
    expect(isQuantity("")).toBe(false);
    expect(() => toThousandths("abc")).toThrow();
  });

  it("formats quantities for display", () => {
    expect(formatQuantity("5.000")).toBe("5");
    expect(formatQuantity("2.500")).toBe("2.5");
    expect(formatQuantity("100")).toBe("100");
    expect(formatQuantity("0.000")).toBe("0");
  });
});
