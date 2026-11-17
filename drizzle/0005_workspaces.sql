CREATE TYPE "public"."task_priority" AS ENUM('none', 'low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."workspace_color" AS ENUM('blue', 'violet', 'green', 'orange', 'pink', 'teal', 'slate');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('client', 'internal');--> statement-breakpoint
ALTER TYPE "public"."ticket_status" ADD VALUE 'backlog' BEFORE 'open';--> statement-breakpoint
ALTER TYPE "public"."ticket_status" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kind" "workspace_kind" DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "color" "workspace_color" DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "priority" "task_priority" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assigned_to_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignee_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "labels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_contact_id_client_contacts_id_fk" FOREIGN KEY ("assignee_contact_id") REFERENCES "public"."client_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Reprise de l'existant : « bloquant » devient la priorité urgente, les tâches de projet existantes sont à toi,
-- et l'ordre du tableau suit l'ordre de création.
UPDATE "tickets" SET "priority" = 'urgent' WHERE "urgent";--> statement-breakpoint
UPDATE "tickets" SET "assigned_to_owner" = true WHERE "kind" = 'task';--> statement-breakpoint
UPDATE "tickets" SET "position" = "number";
