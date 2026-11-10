/** Types métier, alignés sur supabase/migrations/0001_init.sql. */

export const ITEM_KINDS = ["task", "email", "event", "followup"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "waiting", "done", "archived"] as const;
export const ITEM_CONTEXTS = ["perso", "freelance", "semaphors", "saas"] as const;
export const PRIORITY_LEVELS = ["critical", "high", "normal", "low"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemContext = (typeof ITEM_CONTEXTS)[number];
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];
export type SourceKind = "mail" | "microsoft" | "saas" | "manual";

export const OPEN_STATUSES: ItemStatus[] = ["inbox", "todo", "in_progress", "waiting"];

export interface Item {
  id: string;
  owner_id: string;
  source_id: string | null;
  external_id: string | null;
  kind: ItemKind;
  context: ItemContext;
  status: ItemStatus;
  title: string;
  body: string | null;
  url: string | null;
  source_priority: number | null;
  manual_priority: PriorityLevel | null;
  priority_score: number;
  priority_level: PriorityLevel;
  priority_reasons: string[];
  due_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  snoozed_until: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  item_id: string;
  account_id: string;
  mailbox: string;
  uid: number;
  uid_validity: number;
  message_id: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  is_seen: boolean;
  is_answered: boolean;
  is_bulk: boolean;
}

export interface Source {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  kind: SourceKind;
  default_context: ItemContext;
  api_key_hash: string | null;
  api_key_hint: string | null;
  active: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface MailRule {
  id: string;
  owner_id: string;
  match_type: "from_domain" | "from_address" | "subject_contains";
  pattern: string;
  context: ItemContext | null;
  priority_boost: number;
  action: "vip" | "ignore" | "none";
  created_at: string;
}

export type ItemWithEmail = Item & { email_messages: EmailMessage | null };

export const CONTEXT_LABELS: Record<ItemContext, string> = {
  perso: "Perso",
  freelance: "Freelance",
  semaphors: "Semaphors",
  saas: "SaaS",
};

export const LEVEL_LABELS: Record<PriorityLevel, string> = {
  critical: "Urgent",
  high: "Important",
  normal: "Normal",
  low: "Bas",
};
