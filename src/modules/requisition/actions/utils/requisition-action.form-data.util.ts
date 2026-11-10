/**
 * Reads a required text field as an empty string when the browser omits it, so
 * the DTO's own message is shown instead of a generic type error.
 */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Parses the JSON line payload the form keeps in a hidden field. Malformed
 * input becomes an empty list, which the DTO rejects with "Add at least one
 * item." rather than a parser message.
 */
export function readLines(formData: FormData): unknown {
  const raw = formData.get("lines");

  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}