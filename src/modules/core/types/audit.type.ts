export type AuditEntry = {
  /** Null for system actions. */
  actorUserId: number | null;
  /** Table the record lives in, for example "stock_adjustments". */
  entityType: string;
  /** Record ID in that table, or 0 when there is no single record. */
  entityId: number;
  action: string;
  details?: unknown;
};

export type BlockedAudit = Omit<AuditEntry, "actorUserId">;
