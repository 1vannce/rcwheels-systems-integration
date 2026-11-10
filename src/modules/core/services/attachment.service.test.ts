import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { db } from "@/db";
import { auditLog, documentAttachments, purchaseOrders, suppliers } from "@/db/schema";
import {
  closeDatabase,
  createUsersForEveryRole,
  describeWithDatabase,
  resetDatabase,
} from "@/test/db";

import type { AppRole } from "../types/role.type";
import type { AppUser } from "../types/user.type";
import { listAttachments, uploadAttachment } from "./attachment.service";

const storage = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => storage } }),
}));

function pdf(name = "DR 1001.pdf") {
  return new File(["fictional delivery receipt"], name, { type: "application/pdf" });
}

describeWithDatabase("attachment service", () => {
  let users: Record<AppRole, AppUser>;
  let purchaseOrderId: number;

  beforeEach(async () => {
    await resetDatabase();
    storage.upload.mockClear();
    storage.remove.mockClear();
    users = await createUsersForEveryRole();

    const [supplier] = await db
      .insert(suppliers)
      .values({ supplierName: "Test Supplier" })
      .returning();
    const [order] = await db
      .insert(purchaseOrders)
      .values({
        supplierId: supplier.supplierId,
        preparedBy: users.purchasing_staff.userId,
      })
      .returning();

    purchaseOrderId = order.purchaseOrderId;
  });

  afterAll(closeDatabase);

  it("stores the file, links it to the record, and audits the upload", async () => {
    const target = { kind: "purchase_order", id: purchaseOrderId } as const;

    const { attachmentId } = await uploadAttachment(users.purchasing_staff, {
      target,
      documentType: "invoice",
      file: pdf(),
    });

    const [attachment] = await listAttachments(target);

    expect(attachment.attachmentId).toBe(attachmentId);
    expect(attachment.documentType).toBe("invoice");
    expect(attachment.fileUri).toMatch(
      new RegExp(`^purchase_order/${purchaseOrderId}/[0-9a-f-]{36}-DR_1001\\.pdf$`),
    );
    expect(storage.upload).toHaveBeenCalledTimes(1);

    const [entry] = await db.select().from(auditLog);

    expect(entry).toMatchObject({
      actorUserId: users.purchasing_staff.userId,
      entityType: "document_attachments",
      entityId: attachmentId,
      action: "attachment.upload",
    });
  });

  it("refuses a role that may not attach to that record, and records it", async () => {
    await expect(
      uploadAttachment(users.requester, {
        target: { kind: "purchase_order", id: purchaseOrderId },
        documentType: "invoice",
        file: pdf(),
      }),
    ).rejects.toThrow("Your role cannot attach documents to this record.");

    expect(storage.upload).not.toHaveBeenCalled();
    expect(await db.select().from(documentAttachments)).toHaveLength(0);

    const [entry] = await db.select().from(auditLog);

    expect(entry.action).toBe("blocked:attachment.upload");
  });

  it("removes the stored file when the record does not exist", async () => {
    await expect(
      uploadAttachment(users.purchasing_staff, {
        target: { kind: "purchase_order", id: purchaseOrderId + 999 },
        documentType: "invoice",
        file: pdf(),
      }),
    ).rejects.toThrow();

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(await db.select().from(documentAttachments)).toHaveLength(0);
  });
});
