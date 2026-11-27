/** One read-only count on the dashboard. */
export type DashboardCard = {
  label: string;
  count: number;
  /** The matching queue or list; null when the role cannot open it. */
  href: string | null;
};
