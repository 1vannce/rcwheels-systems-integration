import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { db } from "@/db";
import { createClient } from "@/lib/server";

import { findActiveUserByAuthId } from "../repositories/user.repository";
import { ForbiddenError } from "../types/error.type";
import type { AppRole, AppScreen } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { authorizeRole, authorizeScreen } from "./authorization.service";

/**
 * The signed-in app user, or null. The identity comes from the verified
 * Supabase session cookie and the role from the users table, so nothing the
 * browser sends is trusted. Cached for the length of one request.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    return null;
  }

  return findActiveUserByAuthId(db, authUserId);
});

const getAuthUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  // getClaims reads the clock to check token expiry. cookies() alone still
  // resolves in a runtime prefetch, so wait for a real request first.
  await connection();
  const { data } = await supabase.auth.getClaims();

  return data?.claims.sub ?? null;
});

/** For pages and actions that need a signed-in user. */
export async function requireUser(): Promise<AppUser> {
  if (!(await getAuthUserId())) {
    redirect("/login");
  }

  const user = await getCurrentUser();

  // Signed in to Supabase but with no active app account.
  if (!user) {
    redirect("/no-access");
  }

  return user;
}

/** For pages: sends other roles to the forbidden page and records the attempt. */
export async function requireScreen(screen: AppScreen): Promise<AppUser> {
  const user = await requireUser();

  try {
    await authorizeScreen(user, screen);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/forbidden");
    }

    throw error;
  }

  return user;
}

/** For server actions: throws ForbiddenError for other roles and records the attempt. */
export async function requireRole(
  allowedRoles: readonly AppRole[],
  action: string,
): Promise<AppUser> {
  const user = await requireUser();

  await authorizeRole(user, allowedRoles, action);

  return user;
}
