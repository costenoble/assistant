import type {
  clientContacts,
  clients,
  emailMessages,
  items,
  mailRules,
  projects,
  sources,
} from "./schema";

/**
 * Constantes et types métier. Ce fichier est importé par des composants
 * client : il ne doit dépendre de Drizzle que par des `import type`.
 */

export const ITEM_KINDS = ["task", "email", "event", "followup"] as const;
export const ITEM_STATUSES = ["inbox", "todo", "in_progress", "waiting", "done", "archived"] as const;
export const ITEM_CONTEXTS = ["perso", "freelance", "semaphors", "saas"] as const;
export const PRIORITY_LEVELS = ["critical", "high", "normal", "low"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemContext = (typeof ITEM_CONTEXTS)[number];
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];
export const SOURCE_KINDS = ["mail", "microsoft", "saas", "manual"] as const;
export const RULE_MATCHES = ["from_domain", "from_address", "subject_contains"] as const;
export const RULE_ACTIONS = ["vip", "ignore", "none"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const OPEN_STATUSES: ItemStatus[] = ["inbox", "todo", "in_progress", "waiting"];

// Formes des lignes, déduites du schéma (les dates sont des objets Date).
export type Item = typeof items.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type MailRule = typeof mailRules.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientContact = typeof clientContacts.$inferSelect;
export type Project = typeof projects.$inferSelect;

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

// ─── Clients, contacts, projets ─────────────────────────────────────

export const CLIENT_STATUSES = ["prospect", "active", "paused", "archived"] as const;
export const PROJECT_STATUSES = ["draft", "active", "review", "done", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  prospect: "Prospect",
  active: "Actif",
  paused: "En pause",
  archived: "Archivé",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Brouillon (privé)",
  active: "En cours",
  review: "En validation",
  done: "Livré",
  archived: "Archivé",
};
