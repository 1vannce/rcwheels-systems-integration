import { z } from "zod";

export const markNotificationReadSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});
