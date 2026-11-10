"use server";

import { revalidatePath } from "next/cache";

import { markNotificationReadSchema } from "../schemas/notification.schema";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service";
import { requireUser } from "../services/session.service";

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = markNotificationReadSchema.safeParse({
    notificationId: formData.get("notificationId"),
  });

  if (!parsed.success) {
    return;
  }

  await markNotificationRead(user, parsed.data.notificationId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();

  await markAllNotificationsRead(user);
  revalidatePath("/notifications");
}
