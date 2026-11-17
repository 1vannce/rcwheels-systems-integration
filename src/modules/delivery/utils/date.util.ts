// Client-safe date formatting for delivery screens, in Manila time.
const dateTime = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function formatDateTime(value: Date): string {
  return dateTime.format(new Date(value));
}
