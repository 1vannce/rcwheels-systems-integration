/**
 * Formats a numeric requisitionId as RF-YYYYMM-NNN using the submission date.
 * Plain module (no "use client" / "server-only") so server pages and client
 * components can both import it.
 */
export function formatRfNumber(requisitionId: number, submittedAt: Date): string {
  const d = new Date(submittedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const seq = String(requisitionId).padStart(3, "0");
  return `RF-${year}${month}-${seq}`;
}
