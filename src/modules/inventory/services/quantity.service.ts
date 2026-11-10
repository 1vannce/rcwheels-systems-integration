import "server-only";

// Quantities are numeric(14, 3) and travel as decimal strings. They are
// compared and added as whole thousandths so no floating-point error creeps in.

const QUANTITY_PATTERN = /^-?\d{1,11}(\.\d{1,3})?$/;

export function isQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(value);
}

export function toThousandths(value: string): number {
  if (!isQuantity(value)) {
    throw new Error(`Not a quantity with up to 3 decimal places: ${value}`);
  }

  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));

  return negative ? -thousandths : thousandths;
}

export function fromThousandths(thousandths: number): string {
  const sign = thousandths < 0 ? "-" : "";
  const absolute = Math.abs(thousandths);
  const whole = Math.trunc(absolute / 1000);
  const fraction = String(absolute % 1000).padStart(3, "0");

  return `${sign}${whole}.${fraction}`;
}

export function addQuantities(a: string, b: string): string {
  return fromThousandths(toThousandths(a) + toThousandths(b));
}

export function subtractQuantities(a: string, b: string): string {
  return fromThousandths(toThousandths(a) - toThousandths(b));
}

export function negateQuantity(value: string): string {
  return fromThousandths(-toThousandths(value));
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareQuantities(a: string, b: string): number {
  return toThousandths(a) - toThousandths(b);
}

/** Drops trailing zeros for display: "5.000" becomes "5", "2.500" becomes "2.5". */
export function formatQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
