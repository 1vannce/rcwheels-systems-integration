import type { Metadata } from "next";

import { listNotifications, requireScreen } from "@/modules/core";
import { NotificationList } from "@/modules/core/components/notification-list";

export const metadata: Metadata = { title: "Notifications | RCWheels" };

export default async function NotificationsPage() {
  const user = await requireScreen("notifications");
  const notifications = await listNotifications(user);

  return (
    <>
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationList notifications={notifications} />
    </>
  );
}
