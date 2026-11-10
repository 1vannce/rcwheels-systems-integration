import "server-only";

import type { ActionResult } from "../types/action-result.type";
import { BlockedActionError, ForbiddenError } from "../types/error.type";

/**
 * Turns a refusal into a message for the form. Anything else is rethrown,
 * including the redirect signal Next.js throws.
 */
export function actionFailure(error: unknown): ActionResult {
  if (error instanceof BlockedActionError || error instanceof ForbiddenError) {
    return { ok: false, error: error.message };
  }

  throw error;
}
