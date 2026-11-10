export type AppNotification = {
  notificationId: number;
  notificationType: string;
  message: string;
  requisitionId: number | null;
  createdAt: Date;
  readAt: Date | null;
};
