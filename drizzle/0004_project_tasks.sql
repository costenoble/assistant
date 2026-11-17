CREATE TYPE "public"."ticket_kind" AS ENUM('request', 'task');--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "kind" "ticket_kind" DEFAULT 'request' NOT NULL;--> statement-breakpoint
CREATE INDEX "tickets_project_idx" ON "tickets" USING btree ("project_id");