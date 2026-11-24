// Client-safe quantity helpers for delivery forms. Quantities are
// numeric(14, 3) decimal strings, compared and subtracted as whole thousandths
// so no floating-point error creeps in.

const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;

/** A non-negative quantity with up to 3 decimal places. */
export function isQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(value);
}

function toThousandths(value: string): number {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));

  return negative ? -thousandths : thousandths;
}

function fromThousandths(thousandths: number): string {
  const sign = thousandths < 0 ? "-" : "";
  const absolute = Math.abs(thousandths);

  return `${sign}${Math.trunc(absolute / 1000)}.${String(absolute % 1000).padStart(3, "0")}`;
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareQuantities(a: string, b: string): number {
  return toThousandths(a) - toThousandths(b);
}

export function subtractQuantities(a: string, b: string): string {
  return fromThousandths(toThousandths(a) - toThousandths(b));
}

/** Drops trailing zeros for display: "5.000" becomes "5", "2.500" becomes "2.5". */
export function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
