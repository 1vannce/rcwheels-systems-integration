"use server";

import { redirect } from "next/navigation";

import { loginSchema } from "../schemas/auth.schema";
import { signIn, signOut } from "../services/auth.service";
import type { ActionResult } from "../types/action-result.type";

export async function signInAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const result = await signIn(parsed.data.email, parsed.data.password);

  if (!result.ok) {
    return result;
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await signOut();

  redirect("/login");
}
