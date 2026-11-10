"use server";

import { uploadAttachmentSchema } from "../schemas/attachment.schema";
import { actionFailure } from "../services/action-result.service";
import { uploadAttachment } from "../services/attachment.service";
import { requireUser } from "../services/session.service";
import type { ActionResult } from "../types/action-result.type";

// The role allowed depends on the record the file is attached to, so the
// service checks it and audits a refusal.
export async function uploadAttachmentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = uploadAttachmentSchema.safeParse({
    targetKind: formData.get("targetKind"),
    targetId: formData.get("targetId"),
    documentType: formData.get("documentType"),
    file: formData.get("file"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  try {
    await uploadAttachment(user, {
      target: { kind: parsed.data.targetKind, id: parsed.data.targetId },
      documentType: parsed.data.documentType,
      file: parsed.data.file,
    });
  } catch (error) {
    return actionFailure(error);
  }

  return { ok: true, message: "Document attached." };
}
