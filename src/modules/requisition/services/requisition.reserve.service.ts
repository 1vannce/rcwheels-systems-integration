import "server-only";

import { randomUUID } from "node:crypto";
import { recordAudit, runBusinessEvent, type AppUser } from "@/modules/core";
import { ReserveRequisitionDto } from "../schemas/requisition.dto";
import { RequisitionStatus } from "../types/requisition.dto";
import { 
    lockRequisition, 
    findRequisitionLines, 
    updateRequisitionStatus,
    insertRequisitionStatusHistory,
} from "../repositories/requisition.repository";
import { 
    compareQuantities, 
    formatQuantity, 
    reserveStockForLines 
} from "@/modules/inventory";
import { notifyRoles } from "@/modules/core";
import { actionBlockedUtil as blocked } from "./utils/requisition.action-blocker.util";


/**
 * Reserves stock for approved lines after the stock check (BR-RQ-07).
 *
 * Each quantity is capped by the outstanding need (approved - cancelled -
 * reserved) and by the available stock, which stock.service enforces while
 * locking balances in item order. If any line is still uncovered the request
 * moves to Awaiting Stock; otherwise it stays Approved, ready for AR
 * preparation.
 */
export async function reserveRequisitionService(
  actor: AppUser,
  dto: ReserveRequisitionDto,
): Promise<{ requisitionId: number; status: RequisitionStatus }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const locked = await lockRequisition(tx, dto.requisitionId);

    if (!locked) {
      throw blocked("The request no longer exists.", "requisition.reserve", dto);
    }

    if (locked.status !== "approved" && locked.status !== "awaiting_stock") {
      throw blocked("This request is not waiting for stock.", "requisition.reserve", {
        requisitionId: dto.requisitionId,
        status: locked.status,
      });
    }

    const lines = await findRequisitionLines(tx, dto.requisitionId);
    const lineById = new Map(lines.map((line) => [line.requisitionLineId, line]));

    const inputs = dto.lines.map((line) => {
      const existing = lineById.get(line.requisitionLineId);

      if (!existing) {
        throw blocked("A line does not belong to this request.", "requisition.reserve", dto);
      }

      if (compareQuantities(line.quantity, existing.reservableQty) > 0) {
        throw blocked(
          `Only ${formatQuantity(existing.reservableQty)} can still be reserved on this line.`,
          "requisition.reserve",
          dto,
        );
      }

      return {
        requisitionLineId: line.requisitionLineId,
        quantity: line.quantity,
        // Unique per pass, so the custodian can reserve again after a receipt,
        // while the need check above stops a double reservation.
        sourceRef: `req:${dto.requisitionId}:${line.requisitionLineId}:${randomUUID()}`,
      };
    });

    await reserveStockForLines(tx, inputs);

    const after = await findRequisitionLines(tx, dto.requisitionId);
    const fullyReserved = after.every((line) => compareQuantities(line.reservableQty, "0") <= 0);
    const status: RequisitionStatus = fullyReserved ? "approved" : "awaiting_stock";

    if (status !== locked.status) {
      await updateRequisitionStatus(tx, dto.requisitionId, status);
      await insertRequisitionStatusHistory(tx, {
        requisitionId: dto.requisitionId,
        changedBy: actor.userId,
        fromStatus: locked.status,
        toStatus: status,
        reason: status === "awaiting_stock" ? "Stock shortfall" : "Stock reserved",
      });
    }

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "requisitions",
      entityId: dto.requisitionId,
      action: "requisition.reserve",
      details: { reservedLines: dto.lines },
    });

    await notifyRoles(
      tx,
      ["inventory_manager"],
      {
        type: "requisition_reserved",
        message:
          status === "awaiting_stock"
            ? `Request #${dto.requisitionId} was partially reserved and is awaiting stock.`
            : `Request #${dto.requisitionId} is fully reserved and ready for delivery.`,
        requisitionId: dto.requisitionId,
      },
      actor.userId,
    );

    return { requisitionId: dto.requisitionId, status };
  });
}