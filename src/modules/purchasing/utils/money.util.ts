// Cent-exact arithmetic for purchase order totals. Quantities have up to 3
// decimals and unit prices have up to 2, so a line total uses integer
// thousandths and cents and never floating point.

const QUANTITY_PATTERN = /^-?\d{1,11}(\.\d{1,3})?$/;
const MONEY_PATTERN = /^-?\d{1,10}(\.\d{1,2})?$/;

/** Parses a quantity with up to 3 decimals into whole thousandths. */
export function quantityToThousandths(value: string): number {
  if (!QUANTITY_PATTERN.test(value)) {
    throw new Error(`Not a quantity with up to 3 decimal places: ${value}`);
  }

  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const thousandths = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));

  return negative ? -thousandths : thousandths;
}

/** Parses a money amount with up to 2 decimals into whole cents. */
export function moneyToCents(value: string): number {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error(`Not a money amount with up to 2 decimal places: ${value}`);
  }

  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return negative ? -cents : cents;
}

/**
 * A line total in cents: quantity × unit price, rounded half-up to 2 decimals.
 * The multiplication uses BigInt because the numeric columns allow values whose
 * product exceeds the safe integer range.
 */
export function lineTotalCents(quantity: string, unitPrice: string): number {
  const thousandths = BigInt(quantityToThousandths(quantity));
  const cents = BigInt(moneyToCents(unitPrice));
  const product = thousandths * cents;
  const zero = BigInt(0);
  const sign = product < zero ? BigInt(-1) : BigInt(1);
  const absolute = product < zero ? -product : product;
  const rounded = (absolute + BigInt(500)) / BigInt(1000);
  const total = Number(sign * rounded);

  if (!Number.isSafeInteger(total)) {
    throw new Error("The line total is too large to calculate safely.");
  }

  return total;
}

/** Sums whole cents. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/** Formats whole cents with grouped thousands and exactly 2 decimals. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}${grouped}.${fraction}`;
}
