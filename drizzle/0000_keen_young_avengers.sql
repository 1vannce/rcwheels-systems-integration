CREATE TYPE "public"."adjustment_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('requester', 'requisition_approver', 'inventory_custodian', 'inventory_manager', 'purchasing_staff', 'accounting_associate', 'delivery_operations', 'system_administrator');--> statement-breakpoint
CREATE TYPE "public"."internal_discrepancy_status" AS ENUM('pending_resolution', 'replacement_approved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('supplier_receipt', 'dispatch', 'acceptance', 'return', 'return_inspection', 'sales_deduction', 'sales_reversal', 'adjustment', 'supplier_return', 'opening_balance');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('pending_approval', 'for_revision', 'approved', 'placed', 'partially_received', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."purchase_requisition_reason" AS ENUM('shortage', 'reorder');--> statement-breakpoint
CREATE TYPE "public"."purchase_requisition_status" AS ENUM('open', 'covered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('pending_approval', 'rejected', 'approved', 'awaiting_stock', 'for_delivery', 'out_for_delivery', 'pending_resolution', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."stock_condition" AS ENUM('usable', 'damaged', 'hold');--> statement-breakpoint
CREATE TYPE "public"."supplier_discrepancy_status" AS ENUM('open', 'agreed', 'resolved');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"audit_id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"action" text NOT NULL,
	"change_details" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_attachments" (
	"attachment_id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" integer NOT NULL,
	"purchase_order_id" integer,
	"supplier_receipt_id" integer,
	"supplier_discrepancy_id" integer,
	"acknowledgement_receipt_id" integer,
	"internal_discrepancy_id" integer,
	"file_uri" text NOT NULL,
	"document_type" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_attachments_one_target" CHECK ((
        case when "document_attachments"."purchase_order_id" is not null then 1 else 0 end +
        case when "document_attachments"."supplier_receipt_id" is not null then 1 else 0 end +
        case when "document_attachments"."supplier_discrepancy_id" is not null then 1 else 0 end +
        case when "document_attachments"."acknowledgement_receipt_id" is not null then 1 else 0 end +
        case when "document_attachments"."internal_discrepancy_id" is not null then 1 else 0 end
      ) = 1)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" serial PRIMARY KEY NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"requisition_id" integer,
	"notification_type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"role_id" serial PRIMARY KEY NOT NULL,
	"role_name" "app_role" NOT NULL,
	CONSTRAINT "roles_role_name_unique" UNIQUE("role_name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" serial PRIMARY KEY NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role_id" integer NOT NULL,
	"approver_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"item_id" serial PRIMARY KEY NOT NULL,
	"item_code" text NOT NULL,
	"item_name" text NOT NULL,
	"specification" text NOT NULL,
	"unit" text NOT NULL,
	"reorder_point" numeric(14, 3) DEFAULT '0' NOT NULL,
	"average_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "items_item_code_unique" UNIQUE("item_code")
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"adjustment_id" serial PRIMARY KEY NOT NULL,
	"stock_balance_id" integer NOT NULL,
	"counted_by" integer NOT NULL,
	"approved_by" integer,
	"recorded_qty" numeric(14, 3) NOT NULL,
	"counted_qty" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"status" "adjustment_status" DEFAULT 'pending' NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"stock_balance_id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"condition" "stock_condition" NOT NULL,
	"quantity_on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"is_incomplete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"movement_id" serial PRIMARY KEY NOT NULL,
	"stock_balance_id" integer NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"supplier_receipt_line_id" integer,
	"dispatch_line_id" integer,
	"return_line_id" integer,
	"adjustment_id" integer,
	"reverses_movement_id" integer,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(12, 4),
	"event_key" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"reservation_id" serial PRIMARY KEY NOT NULL,
	"requisition_line_id" integer NOT NULL,
	"stock_balance_id" integer NOT NULL,
	"reserved_qty" numeric(14, 3) NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acknowledgement_receipts" (
	"acknowledgement_receipt_id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"prepared_by" integer NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_by" integer,
	"signed_at" timestamp with time zone,
	CONSTRAINT "acknowledgement_receipts_dispatch_unique" UNIQUE("dispatch_id")
);
--> statement-breakpoint
CREATE TABLE "dispatch_lines" (
	"dispatch_line_id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"requisition_line_id" integer NOT NULL,
	"sent_qty" numeric(14, 3) NOT NULL,
	"accepted_qty" numeric(14, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"dispatch_id" serial PRIMARY KEY NOT NULL,
	"requisition_id" integer NOT NULL,
	"dispatched_by" integer NOT NULL,
	"delivery_personnel" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'dispatched' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_lines" (
	"requisition_line_id" serial PRIMARY KEY NOT NULL,
	"requisition_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"requested_qty" numeric(14, 3) NOT NULL,
	"approved_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"cancelled_qty" numeric(14, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisition_status_history" (
	"history_id" serial PRIMARY KEY NOT NULL,
	"requisition_id" integer NOT NULL,
	"changed_by" integer NOT NULL,
	"from_status" "requisition_status",
	"to_status" "requisition_status" NOT NULL,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"requisition_id" serial PRIMARY KEY NOT NULL,
	"submitted_by" integer NOT NULL,
	"requester_name" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"purpose" text NOT NULL,
	"status" "requisition_status" DEFAULT 'pending_approval' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"purchase_order_line_id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"purchase_requisition_line_id" integer NOT NULL,
	"ordered_qty" numeric(14, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"cancelled_qty" numeric(14, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_revisions" (
	"revision_id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"version_no" integer NOT NULL,
	"changed_by" integer NOT NULL,
	"reviewed_by" integer,
	"budget_ok" boolean,
	"review_reason" text,
	"snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"purchase_order_id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"prepared_by" integer NOT NULL,
	"approved_by" integer,
	"ordered_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"status" "purchase_order_status" DEFAULT 'pending_approval' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"delivery_terms" text,
	"supplier_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_requisition_lines" (
	"purchase_requisition_line_id" serial PRIMARY KEY NOT NULL,
	"purchase_requisition_id" integer NOT NULL,
	"requisition_line_id" integer,
	"item_id" integer NOT NULL,
	"requested_qty" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requisitions" (
	"purchase_requisition_id" serial PRIMARY KEY NOT NULL,
	"requested_by" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_reason" "purchase_requisition_reason" NOT NULL,
	"status" "purchase_requisition_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"supplier_id" serial PRIMARY KEY NOT NULL,
	"supplier_name" text NOT NULL,
	"contact_person" text,
	"contact_details" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "internal_discrepancies" (
	"internal_discrepancy_id" serial PRIMARY KEY NOT NULL,
	"dispatch_line_id" integer NOT NULL,
	"reported_by" integer NOT NULL,
	"resolved_by" integer,
	"affected_qty" numeric(14, 3) NOT NULL,
	"problem" text NOT NULL,
	"resolution_action" text,
	"status" "internal_discrepancy_status" DEFAULT 'pending_resolution' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_lines" (
	"return_line_id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"dispatch_line_id" integer NOT NULL,
	"returned_qty" numeric(14, 3) NOT NULL,
	"condition" "stock_condition" NOT NULL,
	"inspected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"return_id" serial PRIMARY KEY NOT NULL,
	"internal_discrepancy_id" integer NOT NULL,
	"received_by" integer NOT NULL,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending_inspection' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_commitments" (
	"commitment_id" serial PRIMARY KEY NOT NULL,
	"supplier_discrepancy_id" integer NOT NULL,
	"agreed_action" text NOT NULL,
	"committed_qty" numeric(14, 3) NOT NULL,
	"expected_delivery_date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_discrepancies" (
	"supplier_discrepancy_id" serial PRIMARY KEY NOT NULL,
	"purchase_order_line_id" integer NOT NULL,
	"supplier_receipt_line_id" integer,
	"reported_by" integer NOT NULL,
	"problem" text NOT NULL,
	"affected_qty" numeric(14, 3) NOT NULL,
	"resolution_action" text,
	"status" "supplier_discrepancy_status" DEFAULT 'open' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_receipt_lines" (
	"supplier_receipt_line_id" serial PRIMARY KEY NOT NULL,
	"supplier_receipt_id" integer NOT NULL,
	"purchase_order_line_id" integer NOT NULL,
	"delivered_qty" numeric(14, 3) NOT NULL,
	"accepted_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"rejected_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"inspection_notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier_receipts" (
	"supplier_receipt_id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"received_by" integer NOT NULL,
	"delivery_receipt_no" text NOT NULL,
	"invoice_no" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_uploaded_by_users_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_purchase_order_id_purchase_orders_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_supplier_receipt_id_supplier_receipts_supplier_receipt_id_fk" FOREIGN KEY ("supplier_receipt_id") REFERENCES "public"."supplier_receipts"("supplier_receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_supplier_discrepancy_id_supplier_discrepancies_supplier_discrepancy_id_fk" FOREIGN KEY ("supplier_discrepancy_id") REFERENCES "public"."supplier_discrepancies"("supplier_discrepancy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_acknowledgement_receipt_id_acknowledgement_receipts_acknowledgement_receipt_id_fk" FOREIGN KEY ("acknowledgement_receipt_id") REFERENCES "public"."acknowledgement_receipts"("acknowledgement_receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_internal_discrepancy_id_internal_discrepancies_internal_discrepancy_id_fk" FOREIGN KEY ("internal_discrepancy_id") REFERENCES "public"."internal_discrepancies"("internal_discrepancy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requisition_id_requisitions_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("requisition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("role_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approver_id_users_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_stock_balance_id_stock_balances_stock_balance_id_fk" FOREIGN KEY ("stock_balance_id") REFERENCES "public"."stock_balances"("stock_balance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_counted_by_users_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_users_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_balance_id_stock_balances_stock_balance_id_fk" FOREIGN KEY ("stock_balance_id") REFERENCES "public"."stock_balances"("stock_balance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_receipt_line_id_supplier_receipt_lines_supplier_receipt_line_id_fk" FOREIGN KEY ("supplier_receipt_line_id") REFERENCES "public"."supplier_receipt_lines"("supplier_receipt_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_dispatch_line_id_dispatch_lines_dispatch_line_id_fk" FOREIGN KEY ("dispatch_line_id") REFERENCES "public"."dispatch_lines"("dispatch_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_line_id_return_lines_return_line_id_fk" FOREIGN KEY ("return_line_id") REFERENCES "public"."return_lines"("return_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_adjustment_id_stock_adjustments_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("adjustment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_movement_id_stock_movements_movement_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."stock_movements"("movement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_requisition_line_id_requisition_lines_requisition_line_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."requisition_lines"("requisition_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_stock_balance_id_stock_balances_stock_balance_id_fk" FOREIGN KEY ("stock_balance_id") REFERENCES "public"."stock_balances"("stock_balance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_receipts" ADD CONSTRAINT "acknowledgement_receipts_dispatch_id_dispatches_dispatch_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("dispatch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_receipts" ADD CONSTRAINT "acknowledgement_receipts_prepared_by_users_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acknowledgement_receipts" ADD CONSTRAINT "acknowledgement_receipts_signed_by_users_user_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_dispatch_id_dispatches_dispatch_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("dispatch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_lines" ADD CONSTRAINT "dispatch_lines_requisition_line_id_requisition_lines_requisition_line_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."requisition_lines"("requisition_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_requisition_id_requisitions_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("requisition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatched_by_users_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("requisition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_item_id_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_requisition_id_requisitions_requisition_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("requisition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_status_history" ADD CONSTRAINT "requisition_status_history_changed_by_users_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_submitted_by_users_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_requisition_line_id_purchase_requisition_lines_purchase_requisition_line_id_fk" FOREIGN KEY ("purchase_requisition_line_id") REFERENCES "public"."purchase_requisition_lines"("purchase_requisition_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_purchase_order_id_purchase_orders_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_changed_by_users_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_revisions" ADD CONSTRAINT "purchase_order_revisions_reviewed_by_users_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_prepared_by_users_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_purchase_requisition_id_purchase_requisitions_purchase_requisition_id_fk" FOREIGN KEY ("purchase_requisition_id") REFERENCES "public"."purchase_requisitions"("purchase_requisition_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_requisition_line_id_requisition_lines_requisition_line_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."requisition_lines"("requisition_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_item_id_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_requested_by_users_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_discrepancies" ADD CONSTRAINT "internal_discrepancies_dispatch_line_id_dispatch_lines_dispatch_line_id_fk" FOREIGN KEY ("dispatch_line_id") REFERENCES "public"."dispatch_lines"("dispatch_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_discrepancies" ADD CONSTRAINT "internal_discrepancies_reported_by_users_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_discrepancies" ADD CONSTRAINT "internal_discrepancies_resolved_by_users_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_return_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("return_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_dispatch_line_id_dispatch_lines_dispatch_line_id_fk" FOREIGN KEY ("dispatch_line_id") REFERENCES "public"."dispatch_lines"("dispatch_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_internal_discrepancy_id_internal_discrepancies_internal_discrepancy_id_fk" FOREIGN KEY ("internal_discrepancy_id") REFERENCES "public"."internal_discrepancies"("internal_discrepancy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_received_by_users_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_commitments" ADD CONSTRAINT "supplier_commitments_supplier_discrepancy_id_supplier_discrepancies_supplier_discrepancy_id_fk" FOREIGN KEY ("supplier_discrepancy_id") REFERENCES "public"."supplier_discrepancies"("supplier_discrepancy_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_discrepancies" ADD CONSTRAINT "supplier_discrepancies_purchase_order_line_id_purchase_order_lines_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("purchase_order_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_discrepancies" ADD CONSTRAINT "supplier_discrepancies_supplier_receipt_line_id_supplier_receipt_lines_supplier_receipt_line_id_fk" FOREIGN KEY ("supplier_receipt_line_id") REFERENCES "public"."supplier_receipt_lines"("supplier_receipt_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_discrepancies" ADD CONSTRAINT "supplier_discrepancies_reported_by_users_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_supplier_receipt_id_supplier_receipts_supplier_receipt_id_fk" FOREIGN KEY ("supplier_receipt_id") REFERENCES "public"."supplier_receipts"("supplier_receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipt_lines" ADD CONSTRAINT "supplier_receipt_lines_purchase_order_line_id_purchase_order_lines_purchase_order_line_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("purchase_order_line_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_purchase_order_id_purchase_orders_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_receipts" ADD CONSTRAINT "supplier_receipts_received_by_users_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "document_attachments_purchase_order_idx" ON "document_attachments" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "document_attachments_supplier_receipt_idx" ON "document_attachments" USING btree ("supplier_receipt_id");--> statement-breakpoint
CREATE INDEX "document_attachments_supplier_discrepancy_idx" ON "document_attachments" USING btree ("supplier_discrepancy_id");--> statement-breakpoint
CREATE INDEX "document_attachments_acknowledgement_receipt_idx" ON "document_attachments" USING btree ("acknowledgement_receipt_id");--> statement-breakpoint
CREATE INDEX "document_attachments_internal_discrepancy_idx" ON "document_attachments" USING btree ("internal_discrepancy_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_idx" ON "notifications" USING btree ("recipient_user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_requisition_id_idx" ON "notifications" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_approver_id_idx" ON "users" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX "stock_adjustments_stock_balance_idx" ON "stock_adjustments" USING btree ("stock_balance_id");--> statement-breakpoint
CREATE INDEX "stock_adjustments_status_idx" ON "stock_adjustments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_balances_item_condition_unique" ON "stock_balances" USING btree ("item_id","condition");--> statement-breakpoint
CREATE INDEX "stock_movements_stock_balance_idx" ON "stock_movements" USING btree ("stock_balance_id");--> statement-breakpoint
CREATE INDEX "stock_movements_movement_type_idx" ON "stock_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_reverses_movement_unique" ON "stock_movements" USING btree ("reverses_movement_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_requisition_line_idx" ON "stock_reservations" USING btree ("requisition_line_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_stock_balance_idx" ON "stock_reservations" USING btree ("stock_balance_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_status_idx" ON "stock_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "acknowledgement_receipts_signed_by_idx" ON "acknowledgement_receipts" USING btree ("signed_by");--> statement-breakpoint
CREATE INDEX "dispatch_lines_dispatch_idx" ON "dispatch_lines" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "dispatch_lines_requisition_line_idx" ON "dispatch_lines" USING btree ("requisition_line_id");--> statement-breakpoint
CREATE INDEX "dispatches_requisition_idx" ON "dispatches" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "dispatches_status_idx" ON "dispatches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requisition_lines_requisition_idx" ON "requisition_lines" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisition_lines_item_idx" ON "requisition_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "requisition_status_history_requisition_idx" ON "requisition_status_history" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "requisition_status_history_changed_at_idx" ON "requisition_status_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "requisitions_submitted_by_idx" ON "requisitions" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "requisitions_status_idx" ON "requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_purchase_order_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_purchase_requisition_line_idx" ON "purchase_order_lines" USING btree ("purchase_requisition_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_revisions_order_version_unique" ON "purchase_order_revisions" USING btree ("purchase_order_id","version_no");--> statement-breakpoint
CREATE INDEX "purchase_order_revisions_purchase_order_idx" ON "purchase_order_revisions" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_prepared_by_idx" ON "purchase_orders" USING btree ("prepared_by");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_requisition_lines_purchase_requisition_idx" ON "purchase_requisition_lines" USING btree ("purchase_requisition_id");--> statement-breakpoint
CREATE INDEX "purchase_requisition_lines_requisition_line_idx" ON "purchase_requisition_lines" USING btree ("requisition_line_id");--> statement-breakpoint
CREATE INDEX "purchase_requisition_lines_item_idx" ON "purchase_requisition_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "purchase_requisitions_requested_by_idx" ON "purchase_requisitions" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "purchase_requisitions_status_idx" ON "purchase_requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "internal_discrepancies_dispatch_line_idx" ON "internal_discrepancies" USING btree ("dispatch_line_id");--> statement-breakpoint
CREATE INDEX "internal_discrepancies_status_idx" ON "internal_discrepancies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "return_lines_return_idx" ON "return_lines" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "return_lines_dispatch_line_idx" ON "return_lines" USING btree ("dispatch_line_id");--> statement-breakpoint
CREATE INDEX "returns_internal_discrepancy_idx" ON "returns" USING btree ("internal_discrepancy_id");--> statement-breakpoint
CREATE INDEX "returns_status_idx" ON "returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_commitments_discrepancy_idx" ON "supplier_commitments" USING btree ("supplier_discrepancy_id");--> statement-breakpoint
CREATE INDEX "supplier_discrepancies_purchase_order_line_idx" ON "supplier_discrepancies" USING btree ("purchase_order_line_id");--> statement-breakpoint
CREATE INDEX "supplier_discrepancies_receipt_line_idx" ON "supplier_discrepancies" USING btree ("supplier_receipt_line_id");--> statement-breakpoint
CREATE INDEX "supplier_discrepancies_status_idx" ON "supplier_discrepancies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_receipt_lines_supplier_receipt_idx" ON "supplier_receipt_lines" USING btree ("supplier_receipt_id");--> statement-breakpoint
CREATE INDEX "supplier_receipt_lines_purchase_order_line_idx" ON "supplier_receipt_lines" USING btree ("purchase_order_line_id");--> statement-breakpoint
CREATE INDEX "supplier_receipts_purchase_order_idx" ON "supplier_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "supplier_receipts_received_by_idx" ON "supplier_receipts" USING btree ("received_by");