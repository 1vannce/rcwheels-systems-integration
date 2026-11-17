import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional link back to the screen the user came from. */
  back?: { href: string; label: string };
  /** Badges shown next to the title, such as a status. */
  badges?: React.ReactNode;
  /** Buttons aligned to the right on wide screens. */
  actions?: React.ReactNode;
}

/** The title block every screen opens with. */
export default function PageHeader({
  title,
  description,
  back,
  badges,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 border-b pb-4">
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <p className="max-w-[70ch] text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
