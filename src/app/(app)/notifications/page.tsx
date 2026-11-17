import type { Metadata } from "next";

import PageHeader from "@/components/page-header";
import { listNotifications, requireScreen } from "@/modules/core";
import { NotificationList } from "@/modules/core/components/notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireScreen("notifications");
  const notifications = await listNotifications(user);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates on your requests and on work waiting in your queues."
      />
      <NotificationList notifications={notifications} />
    </>
  );
}
