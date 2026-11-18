/** Reads a required text field as an empty string when the browser omits it. */
export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Parses the JSON line payload the PR form keeps in a hidden field. Malformed
 * input becomes an empty list so the DTO shows its own message.
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
