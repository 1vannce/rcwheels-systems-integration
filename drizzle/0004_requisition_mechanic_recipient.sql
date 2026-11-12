ALTER TABLE "users" ADD COLUMN "is_mechanic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "requested_for_user_id" integer;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requested_for_user_id_users_user_id_fk" FOREIGN KEY ("requested_for_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_mechanic_active_idx" ON "users" USING btree ("is_mechanic","is_active");--> statement-breakpoint
CREATE INDEX "requisitions_requested_for_user_id_idx" ON "requisitions" USING btree ("requested_for_user_id");