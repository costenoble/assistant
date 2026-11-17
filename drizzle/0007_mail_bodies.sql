ALTER TABLE "email_messages" ADD COLUMN "cc_addresses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "body_text" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "body_fetched_at" timestamp with time zone;