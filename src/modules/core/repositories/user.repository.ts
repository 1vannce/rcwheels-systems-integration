import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { Tx } from "@/db";
import { roles, users } from "@/db/schema";

import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";

export async function findActiveUserByAuthId(
  tx: Tx,
  authUserId: string,
): Promise<AppUser | null> {
  const [row] = await tx
    .select({
      userId: users.userId,
      email: users.email,
      fullName: users.fullName,
      role: roles.roleName,
      approverId: users.approverId,
    })
    .from(users)
    .innerJoin(roles, eq(roles.roleId, users.roleId))
    .where(and(eq(users.authUserId, authUserId), eq(users.isActive, true)));

  return row ?? null;
}

export async function findActiveUserIdsByRoles(
  tx: Tx,
  roleNames: readonly AppRole[],
): Promise<number[]> {
  if (roleNames.length === 0) {
    return [];
  }

  const rows = await tx
    .select({ userId: users.userId })
    .from(users)
    .innerJoin(roles, eq(roles.roleId, users.roleId))
    .where(and(inArray(roles.roleName, [...roleNames]), eq(users.isActive, true)));

  return rows.map((row) => row.userId);
}
