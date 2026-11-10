import "server-only";

import { ForbiddenError } from "../types/error.type";
import type { AppRole, AppScreen } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { recordBlockedAction } from "./audit.service";
import { roleCanAccessScreen } from "./role-access.service";

export function roleIsAllowed(
  role: AppRole,
  allowedRoles: readonly AppRole[],
): boolean {
  return allowedRoles.includes(role);
}

/**
 * Lets the user through only when their role is in `allowedRoles`. A refusal
 * is written to the audit log before ForbiddenError is thrown.
 */
export async function authorizeRole(
  user: AppUser,
  allowedRoles: readonly AppRole[],
  action: string,
): Promise<void> {
  if (roleIsAllowed(user.role, allowedRoles)) {
    return;
  }

  await recordBlockedAction({
    actorUserId: user.userId,
    entityType: "users",
    entityId: user.userId,
    action,
    details: { reason: "role not allowed", role: user.role },
  });

  throw new ForbiddenError();
}

/** Same check for opening a screen. */
export async function authorizeScreen(
  user: AppUser,
  screen: AppScreen,
): Promise<void> {
  if (roleCanAccessScreen(user.role, screen)) {
    return;
  }

  await recordBlockedAction({
    actorUserId: user.userId,
    entityType: "users",
    entityId: user.userId,
    action: `open-screen:${screen}`,
    details: { reason: "role not allowed", role: user.role },
  });

  throw new ForbiddenError("Your role is not allowed to open this screen.");
}
