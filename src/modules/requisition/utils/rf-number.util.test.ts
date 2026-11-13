import { describe, expect, it } from "vitest";

import { formatRfNumber } from "./rf-number.util";

describe("formatRfNumber", () => {
  it("formats RF-YYYYMM-NNN from the submission date", () => {
    expect(formatRfNumber(7, new Date(2026, 10, 12))).toBe("RF-202611-007");
  });

  it("does not truncate ids longer than three digits", () => {
    expect(formatRfNumber(1234, new Date(2026, 0, 1))).toBe("RF-202601-1234");
  });
});
