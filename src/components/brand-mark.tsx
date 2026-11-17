import { cn } from "@/lib/utils";

/**
 * The compact Ubec Mags mark for tight spaces (collapsed sidebar, browser
 * tab): the logo's geometric U in white on racing red, with the speed cut.
 * The full wordmark is used wherever there is room for it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="6" fill="#E10600" />
      <path
        d="M8 7h4.5v11.5c0 1.4 1.1 2.5 2.5 2.5h2c1.4 0 2.5-1.1 2.5-2.5V7H24v12c0 3.3-2.7 6-6 6h-4c-3.3 0-6-2.7-6-6Z"
        fill="#fff"
      />
      <path d="M21 27.5h3l1.2-2h-3Zm4 0h2l1.2-2h-2Z" fill="#fff" opacity="0.85" />
    </svg>
  );
}
