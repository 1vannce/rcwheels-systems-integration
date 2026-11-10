export const attachmentTargetKinds = [
  "purchase_order",
  "supplier_receipt",
  "supplier_discrepancy",
  "acknowledgement_receipt",
  "internal_discrepancy",
] as const;

export type AttachmentTargetKind = (typeof attachmentTargetKinds)[number];

export type AttachmentTarget = { kind: AttachmentTargetKind; id: number };

export type Attachment = {
  attachmentId: number;
  uploadedBy: number;
  fileUri: string;
  documentType: string;
  uploadedAt: Date;
};
