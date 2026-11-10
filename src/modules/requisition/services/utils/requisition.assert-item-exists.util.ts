import "server-only";

import { Tx } from "@/db";
import { BlockedActionError } from "@/modules/core";
import { findExistingItemIds } from "../../repositories/requisition.repository";
import type { CreateRequisitionLineDto } from "../../schemas/requisition.dto";

/**
 * Refuses a submission that names an item which no longer exists. The form can
 * be open while an admin removes an item, so this is a normal case, not an
 * exception from the database.
 */
export async function assertItemsExistUtil(
  tx: Tx,
  lines: CreateRequisitionLineDto[],
): Promise<void> {
  const itemIds = lines.map((line) => line.itemId);
  const existing = new Set(await findExistingItemIds(tx, itemIds));
  const missingItemIds = [...new Set(itemIds.filter((itemId) => !existing.has(itemId)))];

  if (missingItemIds.length === 0) {
    return;
  }

  throw new BlockedActionError(
    "One or more selected items no longer exist. Refresh the page and choose again.",
    {
      entityType: "requisitions",
      entityId: 0,
      action: "requisition.submit",
      details: { missingItemIds },
    },
  );
}