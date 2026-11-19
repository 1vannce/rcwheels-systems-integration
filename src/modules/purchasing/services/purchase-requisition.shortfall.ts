import { compareQuantities, subtractQuantities } from "@/modules/inventory";

const ZERO = "0.000";

/**
 * Quantity a new purchase request may still ask for: the line's unreserved
 * need minus what committed POs already cover, never below zero.
 */
export function calculateUncoveredShortfall(
  reservableQty: string,
  allocatedPoQty: string,
): string {
  const remaining = subtractQuantities(reservableQty, allocatedPoQty);

  return compareQuantities(remaining, ZERO) < 0 ? ZERO : remaining;
}
