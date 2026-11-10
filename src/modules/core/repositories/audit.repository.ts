import "server-only";

import type { Tx } from "@/db";
import { auditLog } from "@/db/schema";

export async function insertAuditEntry(
  tx: Tx,
  entry: {
    actorUserId: number | null;
    entityType: string;
    entityId: number;
    action: string;
    changeDetails: string | null;
  },
): Promise<void> {
  await tx.insert(auditLog).values(entry);
}
