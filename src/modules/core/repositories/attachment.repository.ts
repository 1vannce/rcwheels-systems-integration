import "server-only";

import { asc, eq } from "drizzle-orm";

import type { Tx } from "@/db";
import { documentAttachments } from "@/db/schema";

import type {
  Attachment,
  AttachmentTarget,
  AttachmentTargetKind,
} from "../types/attachment.type";

const targetColumns = {
  purchase_order: documentAttachments.purchaseOrderId,
  supplier_receipt: documentAttachments.supplierReceiptId,
  supplier_discrepancy: documentAttachments.supplierDiscrepancyId,
  acknowledgement_receipt: documentAttachments.acknowledgementReceiptId,
  internal_discrepancy: documentAttachments.internalDiscrepancyId,
} as const;

const targetFields = {
  purchase_order: "purchaseOrderId",
  supplier_receipt: "supplierReceiptId",
  supplier_discrepancy: "supplierDiscrepancyId",
  acknowledgement_receipt: "acknowledgementReceiptId",
  internal_discrepancy: "internalDiscrepancyId",
} as const satisfies Record<AttachmentTargetKind, string>;

const attachmentColumns = {
  attachmentId: documentAttachments.attachmentId,
  uploadedBy: documentAttachments.uploadedBy,
  fileUri: documentAttachments.fileUri,
  documentType: documentAttachments.documentType,
  uploadedAt: documentAttachments.uploadedAt,
};

export async function insertAttachment(
  tx: Tx,
  row: {
    uploadedBy: number;
    target: AttachmentTarget;
    fileUri: string;
    documentType: string;
  },
): Promise<number> {
  const [inserted] = await tx
    .insert(documentAttachments)
    .values({
      uploadedBy: row.uploadedBy,
      fileUri: row.fileUri,
      documentType: row.documentType,
      [targetFields[row.target.kind]]: row.target.id,
    })
    .returning({ attachmentId: documentAttachments.attachmentId });

  return inserted.attachmentId;
}

export async function findAttachmentsByTarget(
  tx: Tx,
  target: AttachmentTarget,
): Promise<Attachment[]> {
  return tx
    .select(attachmentColumns)
    .from(documentAttachments)
    .where(eq(targetColumns[target.kind], target.id))
    .orderBy(asc(documentAttachments.uploadedAt));
}

export async function findAttachmentById(
  tx: Tx,
  attachmentId: number,
): Promise<Attachment | null> {
  const [row] = await tx
    .select(attachmentColumns)
    .from(documentAttachments)
    .where(eq(documentAttachments.attachmentId, attachmentId));

  return row ?? null;
}
