// Public API of the core module: export services and types only.
export { getVisibleScreensForRole, roleCanAccessScreen } from "./services/role-access.service";
export type { AppRole, AppScreen } from "./types/role.type";
export { appRoles, appScreens } from "./types/role.type";
