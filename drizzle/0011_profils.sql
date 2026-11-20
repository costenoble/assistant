ALTER TABLE "client_contacts" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;