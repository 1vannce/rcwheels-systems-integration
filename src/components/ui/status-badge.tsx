import { cn } from "cn";

/**
 * What a status means for the person looking at it, not which record it
 * belongs to. Every module maps its own statuses onto these tones so a
 * waiting request and a waiting adjustment look alike.
 */
export type StatusTone = "waiting" | "active" | "done" | "review" | "stopped" | "closed";

const toneClasses: Record<StatusTone, string> = {
  waiting:
    "bg-amber-50 text-amber-900 before:bg-amber-500 dark:bg-amber-400/10 dark:text-amber-200",
  active:
    "bg-neutral-100 text-neutral-900 before:bg-neutral-900 dark:bg-white/10 dark:text-neutral-100 dark:before:bg-neutral-100",
  done:
    "bg-emerald-50 text-emerald-900 before:bg-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200",
  review:
    "bg-violet-50 text-violet-900 before:bg-violet-600 dark:bg-violet-400/10 dark:text-violet-200",
  stopped: "bg-red-50 text-red-900 before:bg-red-800 dark:bg-red-400/10 dark:text-red-200",
  closed: "bg-muted text-muted-foreground before:bg-muted-foreground/60",
};

/**
 * A status tag shaped like a bin label: a coloured edge on the left and the
 * status name in words, so colour is never the only cue.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center overflow-hidden rounded-sm py-0.5 pr-2 pl-2.5 text-xs font-medium whitespace-nowrap",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The urgent marker. Racing red marks urgency across the app, so an urgent
 * request stands out in any list.
 */
export function UrgentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-signal px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-white",
        className,
      )}
    >
      Urgent
    </span>
  );
}
