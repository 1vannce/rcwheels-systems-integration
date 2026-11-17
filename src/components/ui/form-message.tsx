import { AlertCircle, CheckCircle2 } from "lucide-react";

// Shows the result a server action returned to its form.
function FormMessage({
  result,
}: {
  result: { ok: true; message?: string } | { ok: false; error: string } | null;
}) {
  if (!result) {
    return null;
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{result.error}</span>
      </div>
    );
  }

  return result.message ? (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-emerald-600/25 bg-emerald-500/8 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-200"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
      <span>{result.message}</span>
    </div>
  ) : null;
}

export { FormMessage };
