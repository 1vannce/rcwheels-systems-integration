import "server-only";

import { db } from "@/db";
import { createClient } from "@/lib/server";

import { findActiveUserByAuthId } from "../repositories/user.repository";
import type { ActionResult } from "../types/action-result.type";
import { recordAudit, recordBlockedAction } from "./audit.service";

/**
 * Signs in through Supabase Auth, then checks that the account is an active
 * RCWheels user. An account without one is signed straight back out.
 */
export async function signIn(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { ok: false, error: "Incorrect email or password." };
  }

  const user = await findActiveUserByAuthId(db, data.user.id);

  if (!user) {
    await supabase.auth.signOut();
    await recordBlockedAction({
      actorUserId: null,
      entityType: "users",
      entityId: 0,
      action: "login",
      details: { reason: "no active RCWheels account for this sign-in" },
    });

    return { ok: false, error: "This account has no access to RCWheels." };
  }

  await recordAudit(db, {
    actorUserId: user.userId,
    entityType: "users",
    entityId: user.userId,
    action: "login",
  });

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();

  await supabase.auth.signOut();
}
