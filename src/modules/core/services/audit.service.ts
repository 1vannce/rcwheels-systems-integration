import "server-only";

import { db, type Tx } from "@/db";

import { insertAuditEntry } from "../repositories/audit.repository";
import type { AuditEntry } from "../types/audit.type";
import { BlockedActionError } from "../types/error.type";

function toChangeDetails(details: unknown): string | null {
  if (details === undefined || details === null) {
    return null;
  }

  return typeof details === "string" ? details : JSON.stringify(details);
}

/** Writes an audit entry inside the caller's transaction. */
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await insertAuditEntry(tx, {
    actorUserId: entry.actorUserId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changeDetails: toChangeDetails(entry.details),
  });
}

/**
 * Records an action the server refused. It uses the root client, not a
 * transaction, so the entry survives the rollback of the event it describes.
 */
export async function recordBlockedAction(entry: AuditEntry): Promise<void> {
  await recordAudit(db, { ...entry, action: `blocked:${entry.action}` });
}

/**
 * Runs one business event in one transaction. When the event throws a
 * BlockedActionError the transaction rolls back first, then the refusal is
 * audited outside it and the error is rethrown.
 */
export async function runBusinessEvent<T>(
  actorUserId: number | null,
  event: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction(event);
  } catch (error) {
    if (error instanceof BlockedActionError) {
      await recordBlockedAction({
        actorUserId,
        ...error.audit,
        details: { reason: error.message, ...asObject(error.audit.details) },
      });
    }

    throw error;
  }
}

function asObject(details: unknown): Record<string, unknown> {
  if (details === undefined || details === null) {
    return {};
  }

  return typeof details === "object"
    ? (details as Record<string, unknown>)
    : { details };
}
