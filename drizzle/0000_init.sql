CREATE TYPE "public"."client_status" AS ENUM('prospect', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."item_context" AS ENUM('perso', 'freelance', 'semaphors', 'saas');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('task', 'email', 'event', 'followup');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('inbox', 'todo', 'in_progress', 'waiting', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'review', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."rule_action" AS ENUM('vip', 'ignore', 'none');--> statement-breakpoint
CREATE TYPE "public"."rule_match" AS ENUM('from_domain', 'from_address', 'subject_contains');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('mail', 'microsoft', 'saas', 'manual');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"portal_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_contacts_client_id_email_unique" UNIQUE("client_id","email")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"website" text,
	"email_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"mailbox" text DEFAULT 'INBOX' NOT NULL,
	"uid" bigint NOT NULL,
	"uid_validity" bigint NOT NULL,
	"message_id" text,
	"from_address" text,
	"from_name" text,
	"to_addresses" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text,
	"snippet" text,
	"received_at" timestamp with time zone NOT NULL,
	"is_seen" boolean DEFAULT false NOT NULL,
	"is_answered" boolean DEFAULT false NOT NULL,
	"is_bulk" boolean DEFAULT false NOT NULL,
	CONSTRAINT "email_messages_account_id_mailbox_uid_validity_uid_unique" UNIQUE("account_id","mailbox","uid_validity","uid")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"external_id" text,
	"client_id" uuid,
	"project_id" uuid,
	"kind" "item_kind" DEFAULT 'task' NOT NULL,
	"context" "item_context" DEFAULT 'perso' NOT NULL,
	"status" "item_status" DEFAULT 'inbox' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"source_priority" smallint,
	"manual_priority" "priority_level",
	"priority_score" smallint DEFAULT 0 NOT NULL,
	"priority_level" "priority_level" DEFAULT 'normal' NOT NULL,
	"priority_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_source_id_external_id_unique" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "mail_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_type" "rule_match" NOT NULL,
	"pattern" text NOT NULL,
	"context" "item_context",
	"priority_boost" smallint DEFAULT 0 NOT NULL,
	"action" "rule_action" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"account_email" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"description" text,
	"due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"default_context" "item_context" DEFAULT 'perso' NOT NULL,
	"api_key_hash" text,
	"api_key_hint" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sources_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_email_idx" ON "client_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_from_idx" ON "email_messages" USING btree ("from_address");--> statement-breakpoint
CREATE INDEX "items_open_idx" ON "items" USING btree ("priority_score" DESC NULLS LAST) WHERE status not in ('done', 'archived');--> statement-breakpoint
CREATE INDEX "items_due_idx" ON "items" USING btree ("due_at") WHERE due_at is not null and status not in ('done', 'archived');--> statement-breakpoint
CREATE INDEX "items_events_idx" ON "items" USING btree ("starts_at") WHERE kind = 'event';--> statement-breakpoint
CREATE INDEX "items_kind_status_idx" ON "items" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "items_client_idx" ON "items" USING btree ("client_id") WHERE client_id is not null;--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");