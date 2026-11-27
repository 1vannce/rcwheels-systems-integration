import Link from "next/link";

import type { TimelineEvent } from "../types/timeline.type";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/** Every linked record of one requisition, oldest first. */
export function RequisitionTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Timeline</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events are recorded for this request.</p>
      ) : (
        <ol className="flex flex-col border-l-2 pl-4">
          {events.map((event) => (
            <li
              key={event.key}
              className="relative flex flex-col gap-0.5 pb-4 text-sm last:pb-0 before:absolute before:top-1.5 before:-left-[21px] before:size-2 before:rounded-full before:bg-foreground/70"
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{event.title}</span>
                {event.records.map((record) =>
                  record.href ? (
                    <Link
                      key={record.number}
                      href={record.href}
                      className="tabular-nums underline underline-offset-4"
                    >
                      {record.number}
                    </Link>
                  ) : (
                    <span key={record.number} className="tabular-nums">
                      {record.number}
                    </span>
                  ),
                )}
              </p>
              <span className="text-xs text-muted-foreground tabular-nums">
                {event.actorName ?? "System"}, {dateFormat.format(event.occurredAt)}
              </span>
              {event.note && (
                <p className="mt-1 max-w-[75ch] rounded-md bg-muted px-3 py-2">{event.note}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
