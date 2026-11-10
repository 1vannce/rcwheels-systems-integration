import { sql } from "drizzle-orm";
import { describe } from "vitest";

import { db } from "@/db";
import { roles, users } from "@/db/schema";
import type { AppRole } from "@/modules/core/types/role.type";
import { appRoles } from "@/modules/core/types/role.type";
import type { AppUser } from "@/modules/core/types/user.type";

export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

/** `describe` for tests that need TEST_DATABASE_URL; skipped when it is unset. */
export const describeWithDatabase = describe.skipIf(!hasTestDatabase);

/** Empties every table so each test starts from the same state. */
export async function resetDatabase() {
  if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error("Refusing to reset a database that is not TEST_DATABASE_URL.");
  }

  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.map((row) => `"${row.tablename}"`).join(", ");

  await db.execute(sql.raw(`truncate table ${names} restart identity`));
}

export async function closeDatabase() {
  await db.$client.end();
}

/** Inserts the eight roles and one fictional user per role. */
export async function createUsersForEveryRole(): Promise<Record<AppRole, AppUser>> {
  const roleRows = await db
    .insert(roles)
    .values(appRoles.map((roleName) => ({ roleName })))
    .returning();

  const userRows = await db
    .insert(users)
    .values(
      roleRows.map((role) => ({
        authUserId: crypto.randomUUID(),
        email: `${role.roleName}@rcwheels.test`,
        fullName: `Test ${role.roleName}`,
        roleId: role.roleId,
      })),
    )
    .returning();

  return Object.fromEntries(
    userRows.map((user, index) => [
      roleRows[index].roleName,
      {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        role: roleRows[index].roleName,
        approverId: user.approverId,
      },
    ]),
  ) as Record<AppRole, AppUser>;
}
