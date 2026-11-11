ALTER TABLE "requisitions" ADD COLUMN "delivery_date" date;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "delivery_location" text;--> statement-breakpoint
UPDATE "requisitions"
SET "delivery_date" = ("submitted_at" AT TIME ZONE 'Asia/Manila')::date,
    "delivery_location" = 'Not specified';--> statement-breakpoint
ALTER TABLE "requisitions"
  ALTER COLUMN "delivery_date" SET NOT NULL,
  ALTER COLUMN "delivery_location" SET NOT NULL;
