import "server-only";

import { db } from "@/db";
import { createAdminClient } from "@/lib/admin";

import {
  findAttachmentById,
  findAttachmentsByTarget,
  insertAttachment,
} from "../repositories/attachment.repository";
import type {
  Attachment,
  AttachmentTarget,
  AttachmentTargetKind,
} from "../types/attachment.type";
import { BlockedActionError } from "../types/error.type";
import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { recordAudit, runBusinessEvent } from "./audit.service";

// Private bucket. Files are reached only through short-lived signed URLs.
export const ATTACHMENT_BUCKET = "documents";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const SIGNED_URL_SECONDS = 60;

// Who may attach a document to each kind of record (PLAN section 6).
export const attachmentUploadRoles: Record<AttachmentTargetKind, readonly AppRole[]> = {
  purchase_order: ["purchasing_staff", "accounting_associate"],
  supplier_receipt: ["inventory_custodian", "delivery_operations", "purchasing_staff"],
  supplier_discrepancy: ["inventory_custodian", "purchasing_staff"],
  acknowledgement_receipt: ["inventory_custodian", "requester", "delivery_operations"],
  internal_discrepancy: ["requester", "inventory_custodian", "requisition_approver"],
};

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";
}

/**
 * Stores a scanned document and links it to its record. The file is uploaded
 * first; if the database step fails the file is removed again, so no stored
 * file is left without a row.
 */
export async function uploadAttachment(
  actor: AppUser,
  input: { target: AttachmentTarget; documentType: string; file: File },
): Promise<{ attachmentId: number }> {
  const { target, documentType, file } = input;

  return runBusinessEvent(actor.userId, async (tx) => {
    const blocked = (reason: string) =>
      new BlockedActionError(reason, {
        entityType: "document_attachments",
        entityId: 0,
        action: "attachment.upload",
        details: { target },
      });

    if (!attachmentUploadRoles[target.kind].includes(actor.role)) {
      throw blocked("Your role cannot attach documents to this record.");
    }

    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      throw blocked("The file must be between 1 byte and 10 MB.");
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      throw blocked("Only PDF, JPEG, PNG, and WebP files can be attached.");
    }

    const storage = createAdminClient().storage.from(ATTACHMENT_BUCKET);
    const path = `${target.kind}/${target.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await storage.upload(path, file, { contentType: file.type });

    if (error) {
      throw new Error(`File upload failed: ${error.message}`);
    }

    try {
      const attachmentId = await insertAttachment(tx, {
        uploadedBy: actor.userId,
        target,
        fileUri: path,
        documentType,
      });

      await recordAudit(tx, {
        actorUserId: actor.userId,
        entityType: "document_attachments",
        entityId: attachmentId,
        action: "attachment.upload",
        details: { target, documentType },
      });

      return { attachmentId };
    } catch (error) {
      await storage.remove([path]);
      throw error;
    }
  });
}

export async function listAttachments(target: AttachmentTarget): Promise<Attachment[]> {
  return findAttachmentsByTarget(db, target);
}

/** A short-lived link to one stored file, or null when it does not exist. */
export async function getAttachmentDownloadUrl(
  attachmentId: number,
): Promise<string | null> {
  const attachment = await findAttachmentById(db, attachmentId);

  if (!attachment) {
    return null;
  }

  const { data } = await createAdminClient()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.fileUri, SIGNED_URL_SECONDS);

  return data?.signedUrl ?? null;
}
