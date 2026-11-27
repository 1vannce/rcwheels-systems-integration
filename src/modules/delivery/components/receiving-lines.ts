// Client-side checks for the receive form, so the Custodian sees a problem
// before submitting. The service repeats every check against the locked PO.

import {
  compareQuantities,
  formatQuantity,
  isQuantity,
  subtractQuantities,
} from "../utils/quantity.util";

export type ReceivingLineDraft = {
  deliveredQty: string;
  acceptedQty: string;
  rejectedQty: string;
  inspectionNotes: string;
};

export const emptyReceivingLine: ReceivingLineDraft = {
  deliveredQty: "",
  acceptedQty: "",
  rejectedQty: "",
  inspectionNotes: "",
};

/** A line left completely blank was not part of this delivery. */
export function isBlankReceivingLine(draft: ReceivingLineDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === "");
}

/** The first problem with an entered line, or null. A blank rejected quantity means 0. */
export function receivingLineError(
  draft: ReceivingLineDraft,
  outstandingQty: string,
): string | null {
  const delivered = draft.deliveredQty.trim();
  const accepted = draft.acceptedQty.trim();
  const rejected = draft.rejectedQty.trim() || "0";

  if (!isQuantity(delivered) || compareQuantities(delivered, "0") <= 0) {
    return "Enter a delivered quantity above zero.";
  }

  if (compareQuantities(delivered, outstandingQty) > 0) {
    return `Only ${formatQuantity(outstandingQty)} is outstanding.`;
  }

  if (!isQuantity(accepted) || !isQuantity(rejected)) {
    return "Enter the accepted and rejected quantities.";
  }

  // Neither can be negative, so accepted above delivered never adds up.
  if (compareQuantities(subtractQuantities(delivered, accepted), rejected) !== 0) {
    return "Accepted plus rejected must equal the delivered quantity.";
  }

  if (compareQuantities(rejected, "0") > 0 && draft.inspectionNotes.trim().length < 3) {
    return "Describe the problem with the rejected items.";
  }

  return null;
}

/** The entry for the action's hidden `lines` field. */
export function toReceivingPayloadLine(purchaseOrderLineId: number, draft: ReceivingLineDraft) {
  return {
    purchaseOrderLineId,
    deliveredQty: draft.deliveredQty.trim(),
    acceptedQty: draft.acceptedQty.trim(),
    rejectedQty: draft.rejectedQty.trim() || "0",
    inspectionNotes: draft.inspectionNotes.trim(),
  };
}
