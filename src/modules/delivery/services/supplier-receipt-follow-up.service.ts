import "server-only";

import type { Tx } from "@/db";
import { notifyRoles, recordAudit, type AppUser } from "@/modules/core";
import { compareQuantities, formatQuantity, subtractQuantities } from "@/modules/inventory";
import type { PurchaseOrderForReceivingDto } from "@/modules/purchasing";
import { getRequisitionForPurchaseService } from "@/modules/requisition";

import {
  findLineIdsWithUnresolvedDiscrepancy,
  findReceiptLinesAfterCommitments,
  findReplacementCommitments,
  findRequisitionsAwaitingItems,
  findResolvedCredits,
  insertSupplierDiscrepancy,
  markSupplierCommitmentFulfilled,
  saveSupplierDiscrepancy,
} from "../repositories/supplier-discrepancy.repository";

// What one supplier receipt sets off after its stock is posted. It runs inside
// the receiving transaction, under the PO header lock, and never touches stock.

type ReceivedLine = {
  supplierReceiptLineId: number;
  purchaseOrderLineId: number;
  deliveredQty: string;
  acceptedQty: string;
  rejectedQty: string;
  inspectionNotes: string;
};

type Receipt = {
  supplierReceiptId: number;
  deliveryReceiptNo: string;
  /** The PO as it stood before this receipt. */
  purchaseOrder: PurchaseOrderForReceivingDto;
  lines: readonly ReceivedLine[];
};

/**
 * Resolves the agreed replacements this receipt completes (BR-SR-08). Quantity
 * accepted after a commitment counts toward the oldest one first, and each unit
 * counts once. A line with nothing left outstanding completes all of its
 * replacements.
 */
async function resolveDeliveredReplacements(
  tx: Tx,
  actor: AppUser,
  receipt: Receipt,
): Promise<void> {
  for (const poLine of receipt.purchaseOrder.lines) {
    const line = receipt.lines.find(
      (received) => received.purchaseOrderLineId === poLine.purchaseOrderLineId,
    );

    if (!line || compareQuantities(line.acceptedQty, "0") <= 0) {
      continue;
    }

    const lineComplete = compareQuantities(line.acceptedQty, poLine.outstandingQty) >= 0;
    const commitments = await findReplacementCommitments(tx, poLine.purchaseOrderLineId);
    const receiptRows = await findReceiptLinesAfterCommitments(tx, poLine.purchaseOrderLineId);
    const unused = new Map(
      receiptRows.map((row) => [row.supplierReceiptLineId, row.acceptedQty]),
    );

    for (const commitment of commitments) {
      let needed = commitment.committedQty;

      for (const row of receiptRows) {
        if (row.commitmentId !== commitment.commitmentId) {
          continue;
        }

        const available = unused.get(row.supplierReceiptLineId)!;
        const used = compareQuantities(available, needed) < 0 ? available : needed;

        unused.set(row.supplierReceiptLineId, subtractQuantities(available, used));
        needed = subtractQuantities(needed, used);
      }

      const delivered = lineComplete || compareQuantities(needed, "0") <= 0;

      if (commitment.status !== "agreed" || !delivered) {
        continue;
      }

      const note = `Replacement received on delivery receipt ${receipt.deliveryReceiptNo}.`;

      await markSupplierCommitmentFulfilled(tx, commitment.supplierDiscrepancyId);
      await saveSupplierDiscrepancy(tx, commitment.supplierDiscrepancyId, {
        status: "resolved",
        resolutionAction: note,
      });
      await recordAudit(tx, {
        actorUserId: actor.userId,
        entityType: "supplier_discrepancies",
        entityId: commitment.supplierDiscrepancyId,
        action: "supplier_discrepancy.resolve",
        details: {
          previousStatus: "agreed",
          status: "resolved",
          note,
          supplierReceiptId: receipt.supplierReceiptId,
        },
      });
      await notifyRoles(
        tx,
        ["purchasing_staff"],
        {
          type: "supplier_discrepancy_resolved",
          message: `Supplier discrepancy report #${commitment.supplierDiscrepancyId} (purchase order #${receipt.purchaseOrder.purchaseOrderId}) is resolved. ${note}`,
        },
        actor.userId,
      );
    }
  }
}

/**
 * Opens SDRs for what this receipt shows is wrong (BR-SR-07): one per line with
 * rejected quantity, and one per PO line that arrived short or not at all. A
 * shortage opens no second report while the line has an unresolved one, so
 * follow-up deliveries do not repeat it. Quantity the supplier already credited
 * is not reported short again, although it stays on the PO balance.
 */
async function openReceiptDiscrepancies(
  tx: Tx,
  actor: AppUser,
  receipt: Receipt,
): Promise<number[]> {
  const received = new Map(receipt.lines.map((line) => [line.purchaseOrderLineId, line]));
  const reported = new Set(
    await findLineIdsWithUnresolvedDiscrepancy(
      tx,
      receipt.purchaseOrder.lines.map((line) => line.purchaseOrderLineId),
    ),
  );
  const credits = await findResolvedCredits(
    tx,
    receipt.purchaseOrder.lines.map((line) => line.purchaseOrderLineId),
  );
  const opened: number[] = [];

  async function open(report: {
    purchaseOrderLineId: number;
    supplierReceiptLineId: number | null;
    affectedQty: string;
    problem: string;
  }) {
    const supplierDiscrepancyId = await insertSupplierDiscrepancy(tx, {
      ...report,
      reportedBy: actor.userId,
    });

    await recordAudit(tx, {
      actorUserId: actor.userId,
      entityType: "supplier_discrepancies",
      entityId: supplierDiscrepancyId,
      action: "supplier_discrepancy.create",
      details: { ...report, supplierReceiptId: receipt.supplierReceiptId },
    });
    opened.push(supplierDiscrepancyId);
  }

  for (const poLine of receipt.purchaseOrder.lines) {
    const line = received.get(poLine.purchaseOrderLineId);

    if (line && compareQuantities(line.rejectedQty, "0") > 0) {
      await open({
        purchaseOrderLineId: poLine.purchaseOrderLineId,
        supplierReceiptLineId: line.supplierReceiptLineId,
        affectedQty: line.rejectedQty,
        problem: line.inspectionNotes || "Rejected on inspection.",
      });
    }

    const shortQty = credits
      .filter((credit) => credit.purchaseOrderLineId === poLine.purchaseOrderLineId)
      .reduce(
        (remaining, credit) => subtractQuantities(remaining, credit.committedQty),
        subtractQuantities(poLine.outstandingQty, line?.deliveredQty ?? "0"),
      );

    if (compareQuantities(shortQty, "0") > 0 && !reported.has(poLine.purchaseOrderLineId)) {
      await open({
        purchaseOrderLineId: poLine.purchaseOrderLineId,
        supplierReceiptLineId: null,
        affectedQty: shortQty,
        problem: `Short delivery on ${receipt.deliveryReceiptNo}: ${formatQuantity(shortQty)} ${poLine.unit} of ${poLine.itemName} did not arrive.`,
      });
    }
  }

  if (opened.length > 0) {
    await notifyRoles(
      tx,
      ["purchasing_staff"],
      {
        type: "supplier_discrepancy_opened",
        message: `Supplier discrepancy report${opened.length === 1 ? "" : "s"} ${opened.map((id) => `#${id}`).join(", ")} opened on purchase order #${receipt.purchaseOrder.purchaseOrderId}. Agree an action with the supplier.`,
      },
      actor.userId,
    );
  }

  return opened;
}

/**
 * Connector D: tells the Custodian which requests awaiting stock can be checked
 * again because their item arrived (BR-SR-10). It only notifies: the receipt
 * already posted the stock, and a request moves when the Custodian reserves it.
 * Only a request that can still reserve a received item is flagged. The
 * receiver is notified too, since they are usually who reserves.
 */
async function flagWaitingRequisitions(tx: Tx, receipt: Receipt): Promise<number[]> {
  const acceptedLineIds = new Set(
    receipt.lines
      .filter((line) => compareQuantities(line.acceptedQty, "0") > 0)
      .map((line) => line.purchaseOrderLineId),
  );
  const itemIds = new Set(
    receipt.purchaseOrder.lines
      .filter((line) => acceptedLineIds.has(line.purchaseOrderLineId))
      .map((line) => line.itemId),
  );
  const requisitionIds: number[] = [];

  for (const requisitionId of await findRequisitionsAwaitingItems(tx, [...itemIds])) {
    const request = await getRequisitionForPurchaseService(tx, requisitionId);
    const stillNeeded = request?.lines.some(
      (line) => itemIds.has(line.itemId) && compareQuantities(line.reservableQty, "0") > 0,
    );

    if (stillNeeded) {
      requisitionIds.push(requisitionId);
    }
  }

  for (const requisitionId of requisitionIds) {
    await notifyRoles(tx, ["inventory_custodian"], {
      type: "requisition_stock_arrived",
      message: `Stock arrived for request #${requisitionId}. Check it again and reserve what is available.`,
      requisitionId,
    });
  }

  return requisitionIds;
}

export async function followUpSupplierReceipt(
  tx: Tx,
  actor: AppUser,
  receipt: Receipt,
): Promise<{ supplierDiscrepancyIds: number[]; flaggedRequisitionIds: number[] }> {
  await resolveDeliveredReplacements(tx, actor, receipt);

  return {
    supplierDiscrepancyIds: await openReceiptDiscrepancies(tx, actor, receipt),
    flaggedRequisitionIds: await flagWaitingRequisitions(tx, receipt),
  };
}
