import { cn } from "cn";

/**
 * Shown when a list has nothing in it. The title says what is empty and the
 * description says what to do next.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-lg border border-dashed bg-card/60 px-5 py-8 sm:items-center sm:text-center",
        className,
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-[60ch] text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
