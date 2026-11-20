ALTER TABLE "purchase_orders" ADD COLUMN "cancelled_by" integer;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_users_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;