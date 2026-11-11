import { BlockedActionError } from "@/modules/core";

/** Builds a blocked-action error for a refused decision (Plan rule 12). */
export function actionBlockedUtil(
    message: string, 
    action: string, 
    details: unknown
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "requisitions",
    entityId: 0,
    action,
    details,
  });
}