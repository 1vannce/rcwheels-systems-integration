import "server-only";

import { db, type Tx } from "@/db";
import { recordBlockedAction, type AppUser } from "@/modules/core";
import {
    findRequisitionById,
    findRequisitionHistory,
    findRequisitionLines,
    lockRequisition,
} from "../repositories/requisition.repository";
import type { RequisitionDetailDto } from "../types/requisition.dto";
import { canViewRequisitionUtil as canViewRequisition } from "./utils/requisition.can-view-requisition.util";

/**
 * One request with its lines and append-only history.
 *
 * Returns null when the request does not exist or the signed-in user may not
 * see it, so the page can answer "not found" without revealing that another
 * person's request exists.
 */
export async function getRequisitionDetailService(
  actor: AppUser,
  requisitionId: number,
): Promise<RequisitionDetailDto | null> {
  const requisition = await findRequisitionById(db, requisitionId);

  if (!requisition) {
    return null;
  }

  if (!canViewRequisition(actor, requisition)) {
    await recordBlockedAction({
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: requisitionId,
      action: "requisition.view",
      details: { reason: "User cannot access this requisition." },
    });
    return null;
  }

  const [lines, history] = await Promise.all([
    findRequisitionLines(db, requisitionId),
    findRequisitionHistory(db, requisitionId),
  ]);

  return { requisition, lines, history };
}

/**
 * Reads one request under a row lock for another module's business event.
 * Purchasing uses this so a PR is never created from a request that changed
 * status between the page load and the submit.
 */
export async function getRequisitionForPurchaseService(
  tx: Tx,
  requisitionId: number,
): Promise<Pick<RequisitionDetailDto, "requisition" | "lines"> | null> {
  const locked = await lockRequisition(tx, requisitionId);

  if (!locked) {
    return null;
  }

  const requisition = await findRequisitionById(tx, requisitionId);

  if (!requisition) {
    return null;
  }

  const lines = await findRequisitionLines(tx, requisitionId);

  return { requisition, lines };
}