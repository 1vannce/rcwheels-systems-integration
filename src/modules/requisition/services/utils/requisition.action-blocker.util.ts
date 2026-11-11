import { BlockedActionError } from "@/modules/core";

/** Builds a blocked-action error for a refused decision (Plan rule 12). */
export async function actionBlockedUtil(
    message: string, 
    action: string, 
    details: unknown
): Promise<BlockedActionError> {
  return new BlockedActionError(message, {
    entityType: "requisitions",
    entityId: 0,
    action,
    details,
  });
}