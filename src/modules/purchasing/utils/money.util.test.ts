import { expect, it } from "vitest";

import {
  formatCents,
  lineTotalCents,
  moneyToCents,
  quantityToThousandths,
  sumCents,
} from "./money.util";

it("parses quantities into whole thousandths", () => {
  expect(quantityToThousandths("2")).toBe(2000);
  expect(quantityToThousandths("2.5")).toBe(2500);
  expect(quantityToThousandths("0.001")).toBe(1);
  expect(quantityToThousandths("-1.234")).toBe(-1234);
});

it("rejects quantities with more than 3 decimals", () => {
  expect(() => quantityToThousandths("2.0001")).toThrow();
  expect(() => quantityToThousandths("not-a-number")).toThrow();
});

it("parses money into whole cents", () => {
  expect(moneyToCents("1500")).toBe(150000);
  expect(moneyToCents("1500.5")).toBe(150050);
  expect(moneyToCents("0.01")).toBe(1);
  expect(moneyToCents("-2.50")).toBe(-250);
});

it("rejects money with more than 2 decimals", () => {
  expect(() => moneyToCents("1.001")).toThrow();
  expect(() => moneyToCents("")).toThrow();
});

it("computes a line total in cents and rounds half-up", () => {
  expect(lineTotalCents("2", "1500")).toBe(300000);
  expect(lineTotalCents("1.234", "99.99")).toBe(12339);
  expect(lineTotalCents("0.5", "0.01")).toBe(1);
  expect(lineTotalCents("0", "1500")).toBe(0);
});

it("sums cents", () => {
  expect(sumCents([300000, 12339, 1])).toBe(312340);
  expect(sumCents([])).toBe(0);
});

it("formats cents with grouped thousands and 2 decimals", () => {
  expect(formatCents(300000)).toBe("3,000.00");
  expect(formatCents(12339)).toBe("123.39");
  expect(formatCents(0)).toBe("0.00");
  expect(formatCents(-250)).toBe("-2.50");
});
