"use server";

import { redirect } from "next/navigation";

import { loginSchema } from "../schemas/auth.schema";
import { signIn, signOut } from "../services/auth.service";
import type { ActionResult } from "../types/action-result.type";

/**
 * Server action for the sign-in form.
 *
 * `useActionState` always calls an action with two arguments:
 *   1. the previous result (null on the first submit), and
 *   2. the submitted `FormData`.
 *
 * The first parameter is unused, so it is named `_previous`. The action never
 * throws for a normal validation or credential failure: it returns an
 * `ActionResult` so the form can render the message next to the inputs.
 */
export async function signInAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Copy only the fields this action expects out of FormData.
  //    FormData.get() returns `FormDataEntryValue | null`, and Zod will report
  //    a normal validation error if a field is missing or not a string.
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // 2. Invalid input stops here. `safeParse` never throws; it returns either
  //    the validated data or the list of issues. The form shows the first
  //    message from the shared schema so validation stays in one place.
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // 3. The action only parses input. The service owns the rule: it signs in
  //    with Supabase, checks that the auth account maps to an active RCWheels
  //    user, audits the login, and returns a result instead of throwing.
  const result = await signIn(parsed.data.email, parsed.data.password);

  // 4. A refused sign-in is passed straight back to `useActionState`, which
  //    gives it to `<FormMessage />`. The password is never echoed back.
  if (!result.ok) {
    return result;
  }

  // 5. Success: `redirect` throws a special Next.js control-flow error, so it
  //    must stay outside any try/catch and must be the last statement. The
  //    browser is sent to the dashboard with the session cookie the service
  //    already set.
  redirect("/dashboard");
}

/**
 * Clears the Supabase session and returns the browser to the login page.
 *
 * Takes no arguments because it is used directly as a `<form action={...}>`
 * in the app shell and on the no-access page.
 */
export async function signOutAction(): Promise<void> {
  await signOut();

  redirect("/login");
}
