// Public API of the core module: export services and types only.
export { actionFailure } from "./services/action-result.service";
export {
  getAttachmentDownloadUrl,
  listAttachments,
  uploadAttachment,
} from "./services/attachment.service";
export {
  recordAudit,
  recordBlockedAction,
  runBusinessEvent,
} from "./services/audit.service";
export {
  authorizeRole,
  authorizeScreen,
  roleIsAllowed,
} from "./services/authorization.service";
export { findScreenByPath, getNavigationForRole } from "./services/navigation.service";
export {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyRoles,
  notifyUsers,
} from "./services/notification.service";
export { getVisibleScreensForRole, roleCanAccessScreen } from "./services/role-access.service";
export {
  getCurrentUser,
  requireRole,
  requireScreen,
  requireUser,
} from "./services/session.service";
export type { ActionResult } from "./types/action-result.type";
export type { Attachment, AttachmentTarget } from "./types/attachment.type";
export type { AuditEntry } from "./types/audit.type";
export { BlockedActionError, ForbiddenError, InvalidInputError } from "./types/error.type";
export type { NavigationGroup, NavigationItem } from "./types/navigation.type";
export type { AppNotification } from "./types/notification.type";
export type { AppRole, AppScreen } from "./types/role.type";
export { appRoles, appScreens } from "./types/role.type";
export type { AppUser } from "./types/user.type";
