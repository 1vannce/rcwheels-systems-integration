import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret key, for server-side work the signed-in
 * session cannot do: private file storage and seeding accounts. Never import
 * this from a client component.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required for file storage.");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
