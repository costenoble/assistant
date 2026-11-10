import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CLIENT_STATUSES,
  ITEM_CONTEXTS,
  ITEM_KINDS,
  ITEM_STATUSES,
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  RULE_ACTIONS,
  RULE_MATCHES,
  SOURCE_KINDS,
} from "./types";

/**
 * Schéma Postgres (Neon). Les clés sont en snake_case, comme les colonnes :
 * une ligne lue en base a exactement la forme utilisée dans l'UI.
 *
 * L'app n'a qu'un admin : pas de colonne `owner_id`. Le navigateur ne parle
 * jamais à la base ; l'isolation des clients se fait dans lib/portal.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const sourceKind = pgEnum("source_kind", SOURCE_KINDS);
export const itemKind = pgEnum("item_kind", ITEM_KINDS);
export const itemStatus = pgEnum("item_status", ITEM_STATUSES);
export const itemContext = pgEnum("item_context", ITEM_CONTEXTS);
export const priorityLevel = pgEnum("priority_level", PRIORITY_LEVELS);
export const ruleMatch = pgEnum("rule_match", RULE_MATCHES);
export const ruleAction = pgEnum("rule_action", RULE_ACTIONS);
export const clientStatus = pgEnum("client_status", CLIENT_STATUSES);
export const projectStatus = pgEnum("project_status", PROJECT_STATUSES);

// ─── Clients, contacts, projets ─────────────────────────────────────

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: clientStatus("status").notNull().default("active"),
  website: text("website"),
  /** Domaines mail du client (ex. boulangerie-martin.fr) : rattachement auto des mails. */
  email_domains: text("email_domains").array().notNull().default(sql`'{}'::text[]`),
  created_at: ts("created_at").notNull().defaultNow(),
  updated_at: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

/** portal_access = la personne peut se connecter au portail avec cet email. */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    client_id: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    full_name: text("full_name").notNull(),
    email: text("email"), // toujours en minuscules
    phone: text("phone"),
    job_title: text("job_title"),
    portal_access: boolean("portal_access").notNull().default(false),
    created_at: ts("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.client_id, t.email), index("client_contacts_email_idx").on(t.email)],
);

/** 'draft' = visible par l'admin seul ; les autres statuts sont visibles du client. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    client_id: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: projectStatus("status").notNull().default("draft"),
    description: text("description"), // partagée avec le client
    due_on: date("due_on"),
    created_at: ts("created_at").notNull().defaultNow(),
    updated_at: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("projects_client_idx").on(t.client_id)],
);

/** Notes internes sur un client. Jamais lues par le portail. */
export const clientNotes = pgTable(
  "client_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    client_id: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    created_at: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("client_notes_client_idx").on(t.client_id)],
);

// ─── Sources et flux unifié ─────────────────────────────────────────

/** Chaque provenance d'items. Pour les SaaS, `api_key_hash` = sha256 de la clé. */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: sourceKind("kind").notNull(),
  default_context: itemContext("default_context").notNull().default("perso"),
  api_key_hash: text("api_key_hash").unique(),
  api_key_hint: text("api_key_hint"), // 4 derniers caractères, pour l'affichage
  active: boolean("active").notNull().default(true),
  last_sync_at: ts("last_sync_at"),
  last_error: text("last_error"),
  created_at: ts("created_at").notNull().defaultNow(),
});

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source_id: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    external_id: text("external_id"), // id côté source (idempotence)
    client_id: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    kind: itemKind("kind").notNull().default("task"),
    context: itemContext("context").notNull().default("perso"),
    status: itemStatus("status").notNull().default("inbox"),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    source_priority: smallint("source_priority"), // 1 = urgent … 4 = bas
    manual_priority: priorityLevel("manual_priority"), // override manuel, prime sur le calcul
    priority_score: smallint("priority_score").notNull().default(0),
    priority_level: priorityLevel("priority_level").notNull().default("normal"),
    priority_reasons: jsonb("priority_reasons").$type<string[]>().notNull().default([]),
    due_at: ts("due_at"),
    starts_at: ts("starts_at"),
    ends_at: ts("ends_at"),
    snoozed_until: ts("snoozed_until"),
    completed_at: ts("completed_at"), // tenu à jour par un trigger (voir drizzle/0001_triggers.sql)
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    created_at: ts("created_at").notNull().defaultNow(),
    updated_at: ts("updated_at").notNull().defaultNow(), // idem : trigger
  },
  (t) => [
    unique().on(t.source_id, t.external_id),
    index("items_open_idx").on(t.priority_score.desc()).where(sql`status not in ('done', 'archived')`),
    index("items_due_idx").on(t.due_at).where(sql`due_at is not null and status not in ('done', 'archived')`),
    index("items_events_idx").on(t.starts_at).where(sql`kind = 'event'`),
    index("items_kind_status_idx").on(t.kind, t.status),
    index("items_client_idx").on(t.client_id).where(sql`client_id is not null`),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    item_id: uuid("item_id").primaryKey().references(() => items.id, { onDelete: "cascade" }),
    account_id: text("account_id").notNull(), // id du compte dans MAIL_ACCOUNTS
    mailbox: text("mailbox").notNull().default("INBOX"),
    uid: bigint("uid", { mode: "number" }).notNull(),
    uid_validity: bigint("uid_validity", { mode: "number" }).notNull(),
    message_id: text("message_id"),
    from_address: text("from_address"),
    from_name: text("from_name"),
    to_addresses: text("to_addresses").array().notNull().default(sql`'{}'::text[]`),
    subject: text("subject"),
    snippet: text("snippet"),
    received_at: ts("received_at").notNull(),
    is_seen: boolean("is_seen").notNull().default(false),
    is_answered: boolean("is_answered").notNull().default(false),
    is_bulk: boolean("is_bulk").notNull().default(false), // newsletter / notification automatique
  },
  (t) => [
    unique().on(t.account_id, t.mailbox, t.uid_validity, t.uid),
    index("email_from_idx").on(t.from_address),
  ],
);

/** Règles de tri des mails : domaine → contexte, client X → VIP… */
export const mailRules = pgTable("mail_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  match_type: ruleMatch("match_type").notNull(),
  pattern: text("pattern").notNull(),
  context: itemContext("context"),
  priority_boost: smallint("priority_boost").notNull().default(0),
  action: ruleAction("action").notNull().default("none"),
  created_at: ts("created_at").notNull().defaultNow(),
});

/** Curseurs de synchronisation (ex. « imap:cstlab:INBOX »). */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

/** Jetons OAuth Microsoft. Jamais renvoyés au navigateur. */
export const oauthTokens = pgTable("oauth_tokens", {
  provider: text("provider").primaryKey(), // "microsoft"
  account_email: text("account_email"),
  access_token: text("access_token").notNull(),
  refresh_token: text("refresh_token").notNull(),
  expires_at: ts("expires_at").notNull(),
  scope: text("scope"),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

// ─── Authentification (tables gérées par Better Auth) ───────────────

export const user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_session_user_idx").on(t.userId)],
);

export const account = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const verification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);
