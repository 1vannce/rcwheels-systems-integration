import "server-only";

import { AppUser, recordAudit, runBusinessEvent } from "@/modules/core";
import { ApproveRequisitionDto } from "../schemas/requisition.dto";
import { lockForDecisionUtil as lockForDecision  } from "./utils/requisition.lock-for-decision.util";
import { 
    findRequisitionLines, 
    updateRequisitionLineApprovedQty,
    updateRequisitionStatus, 
    insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import { compareQuantities } from "@/modules/inventory";
import { notifyUsers, notifyRoles } from "@/modules/core";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";

/** Notification type recorded when a request is approved. */
const APPROVED_NOTIFICATION = "requisition.approved";

/** Notification type fired when an approved request has one or more out-of-stock lines. */
const SHORTAGE_NOTIFICATION = "requisition.stock_shortage";

/**
 * Approves a request, possibly for less than the requested quantity.
 *
 * One transaction stores the per-line approved quantity, moves the header to
 * Approved, appends the history, notifies the requester, and alerts the
 * Inventory Custodian queue (connector A). Approving never authorizes a
 * purchase (BR-RQ-16).
 *
 * When one or more approved lines have zero available stock, the Inventory
 * Manager is also notified so restocking can begin without waiting for the
 * custodian's physical check. The optional `inventoryNote` from the approver
 * is saved to `requisition_status_history.reason` (auditable, Option B) and
 * appended to the shortage notification.
 */
export async function approveRequisitionService(
  actor: AppUser,
  dto: ApproveRequisitionDto,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockForDecision(tx, actor, dto.requisitionId, "requisition.approve");

    // Checks if the approver attempts to approve their own request, 
    // which is not allowed.
    if (locked.submittedBy === actor.userId) {
      throw blocked("You cannot approve your own request.", "requisition.approve", dto);
    }

    const lines = await findRequisitionLines(tx, dto.requisitionId);
    const requestedByLine = new Map(
      lines.map((line) => [line.requisitionLineId, line.requestedQty]),
    );

    for (const line of dto.lines) {
      const requested = requestedByLine.get(line.requisitionLineId);

      if (requested === undefined) {
        throw blocked("One of the lines does not belong to this request.", "requisition.approve", dto);
      }

      if (compareQuantities(line.approvedQty, requested) > 0) {
        throw blocked(
          "The approved quantity cannot exceed what was requested.",
          "requisition.approve",
          dto,
        );
      }

      await updateRequisitionLineApprovedQty(tx, line.requisitionLineId, line.approvedQty);
    }

    // Identify approved lines that have zero available stock so we can notify the
    // Inventory Manager and record the approver's note. Lines where approvedQty is 0
    // or omitted are not approved, so they do not trigger a shortage notice.
    const approvedQtyByLine = new Map(
      dto.lines.map((l) => [l.requisitionLineId, l.approvedQty]),
    );
    const shortageLines = lines.filter((line) => {
      const approvedQty = approvedQtyByLine.get(line.requisitionLineId) ?? "0";
      return (
        compareQuantities(approvedQty, "0") > 0 &&
        compareQuantities(line.availableStock, "0") <= 0
      );
    });
    const hasShortage = shortageLines.length > 0;

    // The approver's note only matters when a shortage notice goes out, so it is
    // kept only then. Otherwise a stale note from the form would sit in the audit
    // trail without ever reaching anyone.
    const historyReason = hasShortage
      ? (dto.inventoryNote ??
        `Approved with ${shortageLines.length} out-of-stock item(s): ${shortageLines.map((l) => l.itemCode).join(", ")}.`)
      : null;

    await updateRequisitionStatus(tx, dto.requisitionId, "approved");
    await insertRequisitionStatusHistory(tx, {
      requisitionId: dto.requisitionId,
      changedBy: actor.userId,
      fromStatus: "pending_approval",
      toStatus: "approved",
      reason: historyReason,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.approve",
      details: { approvedLines: dto.lines, shortageLines: shortageLines.map((l) => l.itemCode) },
    });

    await notifyUsers(tx, [locked.submittedBy], {
      type: APPROVED_NOTIFICATION,
      message: `Request #${dto.requisitionId} was approved.`,
      requisitionId: dto.requisitionId,
    });

    await notifyRoles(
      tx,
      ["inventory_custodian"],
      {
        type: APPROVED_NOTIFICATION,
        message: `Request #${dto.requisitionId} is approved and ready for the stock check.`,
        requisitionId: dto.requisitionId,
      },
      actor.userId,
    );

    // Fire a high-priority shortage alert to the Inventory Manager so
    // restocking can begin immediately — before the custodian's physical check.
    if (hasShortage) {
      const noteClause = dto.inventoryNote ? ` Note from approver: "${dto.inventoryNote}".` : "";
      await notifyRoles(
        tx,
        ["inventory_manager"],
        {
          type: SHORTAGE_NOTIFICATION,
          message:
            `RF #${dto.requisitionId} approved with ${shortageLines.length} out-of-stock item(s)` +
            ` — ${shortageLines.map((l) => `${l.itemCode} (0 available)`).join(", ")}.` +
            ` Restock needed.${noteClause}`,
          requisitionId: dto.requisitionId,
        },
        actor.userId,
      );
    }
  });
}
