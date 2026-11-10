import type { BlockedAudit } from "./audit.type";

/**
 * Thrown inside a business event when a rule stops it. The transaction rolls
 * back, and `runBusinessEvent` then writes `audit` outside it (PLAN rule 12).
 */
export class BlockedActionError extends Error {
  readonly audit: BlockedAudit;

  constructor(message: string, audit: BlockedAudit) {
    super(message);
    this.name = "BlockedActionError";
    this.audit = audit;
  }
}

/** Thrown when the signed-in user's role may not open a screen or run an action. */
export class ForbiddenError extends Error {
  constructor(message = "Your role is not allowed to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
