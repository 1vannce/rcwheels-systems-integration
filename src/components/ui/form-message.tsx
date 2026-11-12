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
        className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
      >
        <AlertCircle className="size-4 shrink-0" />
        <span>{result.error}</span>
      </div>
    );
  }

  return result.message ? (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
    >
      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>{result.message}</span>
    </div>
  ) : null;
}

export { FormMessage };
