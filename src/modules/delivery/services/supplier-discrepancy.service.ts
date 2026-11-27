import "server-only";

import { db, type Tx } from "@/db";
import {
  BlockedActionError,
  ForbiddenError,
  notifyRoles,
  recordAudit,
  runBusinessEvent,
  type AppRole,
  type AppUser,
} from "@/modules/core";
import { compareQuantities } from "@/modules/inventory";
import {
  lockPurchaseOrderForReceivingService,
  type PurchaseOrderStatus,
} from "@/modules/purchasing";

import {
  findDiscrepancyPurchaseOrderId,
  findSupplierCommitment,
  findSupplierDiscrepancies,
  insertSupplierCommitment,
  insertSupplierDiscrepancy,
  lockSupplierDiscrepancy,
  markSupplierCommitmentFulfilled,
  receiptLineIsOnPurchaseOrderLine,
  saveSupplierDiscrepancy,
} from "../repositories/supplier-discrepancy.repository";
import type {
  AgreeSupplierDiscrepancyInput,
  CreateSupplierDiscrepancyInput,
  ResolveSupplierDiscrepancyInput,
  UpdateSupplierDiscrepancyInput,
} from "../schemas/supplier-discrepancy.schema";
import type { SupplierDiscrepancy } from "../types/supplier-discrepancy.type";

const LIST_LIMIT = 100;

const VIEWER_ROLES: readonly AppRole[] = [
  "inventory_custodian",
  "purchasing_staff",
  "accounting_associate",
];

/** The Custodian issues SDRs and Purchasing records resolutions (BR section 2). */
const RESOLVER_ROLES: readonly AppRole[] = ["inventory_custodian", "purchasing_staff"];

/** Goods can only be disputed on a PO that was placed with the supplier. */
const REPORTABLE_STATUSES: readonly PurchaseOrderStatus[] = [
  "placed",
  "partially_received",
  "closed",
];

function blocked(
  action: string,
  supplierDiscrepancyId: number,
  message: string,
  details: Record<string, unknown>,
): BlockedActionError {
  return new BlockedActionError(message, {
    entityType: "supplier_discrepancies",
    entityId: supplierDiscrepancyId,
    action,
    details,
  });
}

function assertViewer(actor: AppUser): void {
  if (!VIEWER_ROLES.includes(actor.role)) {
    throw new ForbiddenError("Your role is not allowed to view supplier discrepancy reports.");
  }
}

export async function listSupplierDiscrepancies(actor: AppUser): Promise<SupplierDiscrepancy[]> {
  assertViewer(actor);

  return db.transaction((tx) => findSupplierDiscrepancies(tx, {}, LIST_LIMIT));
}

export async function getSupplierDiscrepancy(
  actor: AppUser,
  supplierDiscrepancyId: number,
): Promise<SupplierDiscrepancy | null> {
  assertViewer(actor);

  const [report] = await db.transaction((tx) =>
    findSupplierDiscrepancies(tx, { supplierDiscrepancyId }, 1),
  );

  return report ?? null;
}

/**
 * The Custodian records a report by hand, for a problem the receipt does not
 * raise on its own: a wrong item, an excess, or damage found later (BR-SR-06,
 * BR-SR-07). It posts no stock, so an excess has no upper bound here.
 */
export async function createSupplierDiscrepancy(
  actor: AppUser,
  input: CreateSupplierDiscrepancyInput,
): Promise<{ supplierDiscrepancyId: number }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const action = "supplier_discrepancy.create";
    const refuse = (message: string) => blocked(action, 0, message, input);

    if (actor.role !== "inventory_custodian") {
      throw refuse("Only the Inventory Custodian can record a supplier discrepancy report.");
    }

    const purchaseOrder = await lockPurchaseOrderForReceivingService(tx, input.purchaseOrderId);

    if (!purchaseOrder || !REPORTABLE_STATUSES.includes(purchaseOrder.status)) {
      throw refuse("A report needs a purchase order that was placed with the supplier.");
    }

    if (
      !purchaseOrder.lines.some((line) => line.purchaseOrderLineId === input.purchaseOrderLineId)
    ) {
      throw refuse("That line is not on this purchase order.");
    }

    if (
      input.supplierReceiptLineId !== undefined &&
      !(await receiptLineIsOnPurchaseOrderLine(
        tx,
        input.supplierReceiptLineId,
        input.purchaseOrderLineId,
      ))
    ) {
      throw refuse("That receipt line does not belong to the purchase order line.");
    }

    const supplierDiscrepancyId = await insertSupplierDiscrepancy(tx, {
      purchaseOrderLineId: input.purchaseOrderLineId,
      supplierReceiptLineId: input.supplierReceiptLineId ?? null,
      reportedBy: actor.userId,
      problem: input.problem,
      affectedQty: input.affectedQty,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_discrepancies",
      entityId: supplierDiscrepancyId,
      action,
      details: input,
    });
    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: "supplier_discrepancy_opened",
        message: `Supplier discrepancy report #${supplierDiscrepancyId} was opened on purchase order #${input.purchaseOrderId}. Agree an action with the supplier.`,
      },
      actor.userId,
    );

    return { supplierDiscrepancyId };
  });
}

/**
 * Locks the PO header, then the report. Receiving takes the PO lock too, so a
 * status change here cannot race a follow-up delivery.
 */
async function lockForChange(tx: Tx, action: string, supplierDiscrepancyId: number) {
  const purchaseOrderId = await findDiscrepancyPurchaseOrderId(tx, supplierDiscrepancyId);
  const purchaseOrder =
    purchaseOrderId === null
      ? null
      : await lockPurchaseOrderForReceivingService(tx, purchaseOrderId);
  const report = purchaseOrder ? await lockSupplierDiscrepancy(tx, supplierDiscrepancyId) : null;
  const line = purchaseOrder?.lines.find(
    (poLine) => poLine.purchaseOrderLineId === report?.purchaseOrderLineId,
  );

  if (!purchaseOrder || !report || !line) {
    throw blocked(action, supplierDiscrepancyId, "The discrepancy report does not exist.", {
      supplierDiscrepancyId,
    });
  }

  return { purchaseOrder, report, line };
}

/** The Custodian corrects a report while no action has been agreed on it. */
export async function updateSupplierDiscrepancy(
  actor: AppUser,
  input: UpdateSupplierDiscrepancyInput,
): Promise<void> {
  await runBusinessEvent(actor.userId, async (tx) => {
    const action = "supplier_discrepancy.update";
    const refuse = (message: string, details: Record<string, unknown> = input) =>
      blocked(action, input.supplierDiscrepancyId, message, details);

    if (actor.role !== "inventory_custodian") {
      throw refuse("Only the Inventory Custodian can change a supplier discrepancy report.");
    }

    const { report } = await lockForChange(tx, action, input.supplierDiscrepancyId);

    if (report.status !== "open") {
      throw refuse("Only an open report can be changed.", { ...input, status: report.status });
    }

    await saveSupplierDiscrepancy(tx, input.supplierDiscrepancyId, {
      problem: input.problem,
      affectedQty: input.affectedQty,
    });
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_discrepancies",
      entityId: input.supplierDiscrepancyId,
      action,
      details: {
        previous: { problem: report.problem, affectedQty: report.affectedQty },
        problem: input.problem,
        affectedQty: input.affectedQty,
      },
    });
  });
}

/**
 * Purchasing records what the supplier committed to: replace (a follow-up
 * delivery), credit, or cancel the balance (BR-SR-08). Open becomes Agreed.
 * Agreeing to cancel changes no PO quantity: Accounting cancels the balance
 * through connector G (BR-PU-11), and this only asks for it.
 */
export async function agreeSupplierDiscrepancy(
  actor: AppUser,
  input: AgreeSupplierDiscrepancyInput,
): Promise<{ status: "agreed" }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const action = "supplier_discrepancy.agree";
    const refuse = (message: string, details: Record<string, unknown> = input) =>
      blocked(action, input.supplierDiscrepancyId, message, details);

    if (actor.role !== "purchasing_staff") {
      throw refuse("Only Purchasing Staff can agree an action with the supplier.");
    }

    const { purchaseOrder, report, line } = await lockForChange(
      tx,
      action,
      input.supplierDiscrepancyId,
    );

    if (report.status !== "open") {
      throw refuse("Only an open report can be agreed.", { ...input, status: report.status });
    }

    if (compareQuantities(input.committedQty, report.affectedQty) > 0) {
      throw refuse("The committed quantity cannot exceed the affected quantity.");
    }

    if (input.agreedAction === "replace" && purchaseOrder.cancelledAt) {
      throw refuse(
        "This purchase order's balance was cancelled, so no replacement can be received.",
      );
    }

    if (
      input.agreedAction === "cancel" &&
      compareQuantities(line.outstandingQty, "0") === 0 &&
      compareQuantities(line.cancelledQty, "0") === 0
    ) {
      throw refuse("This purchase order line has no balance to cancel.");
    }

    await insertSupplierCommitment(tx, input);
    await saveSupplierDiscrepancy(tx, input.supplierDiscrepancyId, { status: "agreed" });
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_discrepancies",
      entityId: input.supplierDiscrepancyId,
      action,
      details: { ...input, previousStatus: report.status, status: "agreed" },
    });
    await notifyRoles(
      tx,
      ["inventory_custodian"],
      {
        type: "supplier_discrepancy_agreed",
        message: `An action was agreed on supplier discrepancy report #${input.supplierDiscrepancyId} (purchase order #${purchaseOrder.purchaseOrderId}).`,
      },
      actor.userId,
    );

    if (input.agreedAction === "cancel" && !purchaseOrder.cancelledAt) {
      await notifyRoles(tx, ["accounting_associate"], {
        type: "supplier_discrepancy_cancel_requested",
        message: `The supplier will not deliver the balance of purchase order #${purchaseOrder.purchaseOrderId} (report #${input.supplierDiscrepancyId}). Cancel the remaining balance.`,
      });
    }

    return { status: "agreed" as const };
  });
}

/**
 * Closes an agreed report: Agreed becomes Resolved. A cancel commitment is
 * resolved only after Accounting cancelled the balance. A replacement is
 * resolved by hand only once nothing is left to deliver (an accepted follow-up
 * delivery resolves it in Supplier Receiving). A credit is resolved with the
 * note.
 */
export async function resolveSupplierDiscrepancy(
  actor: AppUser,
  input: ResolveSupplierDiscrepancyInput,
): Promise<{ status: "resolved" }> {
  return runBusinessEvent(actor.userId, async (tx) => {
    const action = "supplier_discrepancy.resolve";
    const refuse = (message: string, details: Record<string, unknown> = input) =>
      blocked(action, input.supplierDiscrepancyId, message, details);

    if (!RESOLVER_ROLES.includes(actor.role)) {
      throw refuse("Only the Inventory Custodian or Purchasing Staff can resolve this report.");
    }

    const { purchaseOrder, report, line } = await lockForChange(
      tx,
      action,
      input.supplierDiscrepancyId,
    );

    if (report.status !== "agreed") {
      throw refuse("Only a report with an agreed action can be resolved.", {
        ...input,
        status: report.status,
      });
    }

    const commitment = await findSupplierCommitment(tx, input.supplierDiscrepancyId);

    if (
      commitment?.agreedAction === "cancel" &&
      !(purchaseOrder.cancelledAt && compareQuantities(line.cancelledQty, "0") > 0)
    ) {
      throw refuse("Accounting has not cancelled the purchase order balance yet.");
    }

    if (commitment?.agreedAction === "replace" && compareQuantities(line.outstandingQty, "0") > 0) {
      throw refuse(
        "The replacement is still due. Receive the follow-up delivery, or have the balance cancelled first.",
      );
    }

    await markSupplierCommitmentFulfilled(tx, input.supplierDiscrepancyId);
    await saveSupplierDiscrepancy(tx, input.supplierDiscrepancyId, {
      status: "resolved",
      resolutionAction: input.note,
    });
    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_discrepancies",
      entityId: input.supplierDiscrepancyId,
      action,
      details: { ...input, previousStatus: report.status, status: "resolved" },
    });
    await notifyRoles(
      tx,
      RESOLVER_ROLES,
      {
        type: "supplier_discrepancy_resolved",
        message: `Supplier discrepancy report #${input.supplierDiscrepancyId} (purchase order #${purchaseOrder.purchaseOrderId}) is resolved.`,
      },
      actor.userId,
    );

    return { status: "resolved" as const };
  });
}
