import "server-only";

import type { Tx } from "@/db";
import { auditLog } from "@/db/schema";

// Append-only: this repository exposes inserts only. Never add update or
// delete helpers; corrections are new audit entries, not edits to old ones.
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
