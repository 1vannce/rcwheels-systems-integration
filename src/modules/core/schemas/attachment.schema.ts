import { z } from "zod";

import { attachmentTargetKinds } from "../types/attachment.type";

export const uploadAttachmentSchema = z.object({
  targetKind: z.enum(attachmentTargetKinds),
  targetId: z.coerce.number().int().positive(),
  documentType: z.string().trim().min(1, "Enter the document type.").max(50),
  file: z.instanceof(File, { message: "Choose a file to attach." }),
});
