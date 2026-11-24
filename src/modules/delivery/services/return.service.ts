import "server-only";

import { db } from "@/db";
import {
  BlockedActionError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppUser,
} from "@/modules/core";
import {
  addQuantities,
  compareQuantities,
  formatQuantity,
  inspectReturn,
  receiveReturnedItems,
  subtractQuantities,
} from "@/modules/inventory";
import { formatRfNumber, settleRequisitionAfterDelivery } from "@/modules/requisition";

import {
  findDiscrepancies,
  findReturnLinesInHold,
  insertReturn,
  insertReturnLine,
  lockDiscrepancy,
  lockReturnLine,
  returnHasHeldLines,
  sumReturnedForDiscrepancy,
  updateReturnLineInspection,
  updateReturnStatus,
} from "../repositories/delivery.repository";
import type { InspectReturnInput, ReceiveReturnInput } from "../schemas/delivery.schema";
import type { InternalDiscrepancy, ReturnLineToInspect } from "../types/delivery.type";
import { toDiscrepancies } from "./discrepancy.service";
import { notifyAfterDeliveryEvent } from "./internal-delivery.service";

const LIST_LIMIT = 100;

function blocked(
  message: string,
  action: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "returns",
    entityId: 0,
    action,
    details,
  });
}

/** RDRs whose rejected items are not all back in the stockroom yet. */
export async function listReturnsToReceive(): Promise<InternalDiscrepancy[]> {
  return toDiscrepancies(await findDiscrepancies(db, { awaitingReturn: true }, LIST_LIMIT));
}

/** Returned lines in held stock: new returns and earlier uncertain ones. */
export async function listReturnLinesToInspect(): Promise<ReturnLineToInspect[]> {
  const rows = await findReturnLinesInHold(db, LIST_LIMIT);

  return rows.map(({ submittedAt, ...row }) => ({
    ...row,
    rfNumber: formatRfNumber(row.requisitionId, submittedAt),
  }));
}

/**
 * Rejected items are brought back to the stockroom: in transit -q, held +q
 * (BR-DL-08). A return cannot exceed what the RDR still has outstanding, and
 * the stock event refuses more than is in transit. Each return line posts once.
 */
export async function receiveReturn(
  actor: AppUser,
  input: ReceiveReturnInput,
): Promise<{ returnId: number; returnLineId: number }> {
  const action = "delivery.receive-return";

  return runBusinessEvent(actor.userId, async (tx) => {
    const rdr = await lockDiscrepancy(tx, input.internalDiscrepancyId);

    if (!rdr) {
      throw blocked("The discrepancy report does not exist.", action, input);
    }

    const alreadyReturned = await sumReturnedForDiscrepancy(tx, rdr.internalDiscrepancyId);
    const remaining = subtractQuantities(rdr.affectedQty, alreadyReturned);

    if (compareQuantities(addQuantities(alreadyReturned, input.returnedQty), rdr.affectedQty) > 0) {
      throw blocked(
        `Only ${formatQuantity(remaining)} is still to be returned on this report.`,
        action,
        { ...input, remaining },
      );
    }

    const returnId = await insertReturn(tx, {
      internalDiscrepancyId: rdr.internalDiscrepancyId,
      receivedBy: actor.userId,
    });
    const returnLineId = await insertReturnLine(tx, {
      returnId,
      dispatchLineId: rdr.dispatchLineId,
      returnedQty: input.returnedQty,
    });

    await receiveReturnedItems(tx, { returnLineId });

    const request = await settleRequisitionAfterDelivery(tx, {
      requisitionId: rdr.requisitionId,
      actorUserId: actor.userId,
      reason: "Rejected items returned to the stockroom",
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "returns",
      entityId: returnId,
      action,
      details: { internalDiscrepancyId: rdr.internalDiscrepancyId, returnedQty: input.returnedQty },
    });

    await notifyRoles(
      tx,
      ["inventory_custodian"],
      {
        type: "delivery_return_received",
        message: `Returned items on request #${rdr.requisitionId} are waiting for inspection.`,
        requisitionId: rdr.requisitionId,
      },
      actor.userId,
    );

    await notifyAfterDeliveryEvent(tx, request, 0);

    return { returnId, returnLineId };
  });
}

/**
 * The Custodian inspects one returned line (BR-DL-09, BR-IN-12). Usable goes
 * back to usable stock and damaged to damaged stock, each posted once. An
 * uncertain result posts nothing: the items stay held until reinspected.
 */
export async function inspectReturnLine(
  actor: AppUser,
  input: InspectReturnInput,
): Promise<{ returnId: number }> {
  const action = "delivery.inspect-return";

  return runBusinessEvent(actor.userId, async (tx) => {
    const line = await lockReturnLine(tx, input.returnLineId);

    if (!line) {
      throw blocked("The return line does not exist.", action, input);
    }

    if (line.condition !== "hold") {
      throw blocked("This return line is already inspected.", action, {
        ...input,
        condition: line.condition,
      });
    }

    if (input.result === "uncertain") {
      await updateReturnLineInspection(tx, line.returnLineId, "hold");
    } else {
      await inspectReturn(tx, { returnLineId: line.returnLineId, result: input.result });
      await updateReturnLineInspection(tx, line.returnLineId, input.result);
    }

    const stillHeld = await returnHasHeldLines(tx, line.returnId);
    await updateReturnStatus(tx, line.returnId, stillHeld ? "held" : "inspected");

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "return_lines",
      entityId: line.returnLineId,
      action,
      details: { result: input.result, returnedQty: line.returnedQty },
    });

    return { returnId: line.returnId };
  });
}
