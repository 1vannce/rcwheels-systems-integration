// Identity and shared records: users, roles, notifications, document_attachments, audit_log

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { appRoleEnum } from "./enums";
import { acknowledgementReceipts, requisitions } from "./requisition";
import {
  internalDiscrepancies,
  supplierDiscrepancies,
  supplierReceipts,
} from "./delivery";
import { purchaseOrders } from "./purchasing";

export const roles = pgTable("roles", {
  roleId: serial("role_id").primaryKey(),
  roleName: appRoleEnum("role_name").notNull().unique("roles_role_name_unique"),
}).enableRLS();

export const users = pgTable(
  "users",
  {
    userId: serial("user_id").primaryKey(),
    // Supabase Auth owns the account. There is deliberately no FK to auth.users.
    authUserId: uuid("auth_user_id").notNull().unique("users_auth_user_id_unique"),
    email: text("email").notNull().unique("users_email_unique"),
    fullName: text("full_name").notNull(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.roleId),
    approverId: integer("approver_id").references((): AnyPgColumn => users.userId),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("users_role_id_idx").on(t.roleId),
    index("users_approver_id_idx").on(t.approverId),
  ],
).enableRLS();

export const notifications = pgTable(
  "notifications",
  {
    notificationId: serial("notification_id").primaryKey(),
    recipientUserId: integer("recipient_user_id")
      .notNull()
      .references(() => users.userId),
    requisitionId: integer("requisition_id").references(
      (): AnyPgColumn => requisitions.requisitionId,
    ),
    notificationType: text("notification_type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_recipient_read_idx").on(t.recipientUserId, t.readAt),
    index("notifications_requisition_id_idx").on(t.requisitionId),
  ],
).enableRLS();

export const documentAttachments = pgTable(
  "document_attachments",
  {
    attachmentId: serial("attachment_id").primaryKey(),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.userId),
    purchaseOrderId: integer("purchase_order_id").references(
      (): AnyPgColumn => purchaseOrders.purchaseOrderId,
    ),
    supplierReceiptId: integer("supplier_receipt_id").references(
      (): AnyPgColumn => supplierReceipts.supplierReceiptId,
    ),
    supplierDiscrepancyId: integer("supplier_discrepancy_id").references(
      (): AnyPgColumn => supplierDiscrepancies.supplierDiscrepancyId,
    ),
    acknowledgementReceiptId: integer("acknowledgement_receipt_id").references(
      (): AnyPgColumn => acknowledgementReceipts.acknowledgementReceiptId,
    ),
    internalDiscrepancyId: integer("internal_discrepancy_id").references(
      (): AnyPgColumn => internalDiscrepancies.internalDiscrepancyId,
    ),
    fileUri: text("file_uri").notNull(),
    documentType: text("document_type").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "document_attachments_one_target",
      sql`(
        case when ${t.purchaseOrderId} is not null then 1 else 0 end +
        case when ${t.supplierReceiptId} is not null then 1 else 0 end +
        case when ${t.supplierDiscrepancyId} is not null then 1 else 0 end +
        case when ${t.acknowledgementReceiptId} is not null then 1 else 0 end +
        case when ${t.internalDiscrepancyId} is not null then 1 else 0 end
      ) = 1`,
    ),
    index("document_attachments_purchase_order_idx").on(t.purchaseOrderId),
    index("document_attachments_supplier_receipt_idx").on(t.supplierReceiptId),
    index("document_attachments_supplier_discrepancy_idx").on(
      t.supplierDiscrepancyId,
    ),
    index("document_attachments_acknowledgement_receipt_idx").on(
      t.acknowledgementReceiptId,
    ),
    index("document_attachments_internal_discrepancy_idx").on(
      t.internalDiscrepancyId,
    ),
  ],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    auditId: serial("audit_id").primaryKey(),
    // Null for system actions.
    actorUserId: integer("actor_user_id").references(() => users.userId),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(),
    changeDetails: text("change_details"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_user_id_idx").on(t.actorUserId),
    index("audit_log_occurred_at_idx").on(t.occurredAt),
  ],
).enableRLS();
