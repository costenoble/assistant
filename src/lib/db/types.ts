import type {
  clientContacts,
  clientNotes,
  ticketMessages,
  tickets,
  clients,
  emailMessages,
  items,
  mailRules,
  meetings,
  projects,
  sources,
} from "./schema";

/**
 * Constantes et types métier. Ce fichier est importé par des composants
 * client : il ne doit dépendre de Drizzle que par des `import type`.
 */

export const ITEM_KINDS = ["task", "email", "event", "followup", "ticket"] as const;
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
export type ClientNote = typeof clientNotes.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;

// ─── Tickets (demandes des clients) ─────────────────────────────────

export const TICKET_STATUSES = ["backlog", "open", "in_progress", "waiting_client", "resolved", "canceled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_AUTHORS = ["client", "admin"] as const;
/** request = demande au support ; task = tâche partagée d'un projet. */
export const TICKET_KINDS = ["request", "task"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

/** Tâches de projet, vues par l'admin. */
export const TASK_STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  open: "À faire",
  in_progress: "En cours",
  waiting_client: "À valider",
  resolved: "Fait",
  canceled: "Annulé",
};

/** Tâches de projet, vues par le client. */
export const TASK_STATUS_LABELS_CLIENT: Record<TicketStatus, string> = {
  backlog: "Backlog",
  open: "À faire",
  in_progress: "En cours",
  waiting_client: "À valider",
  resolved: "Fait",
  canceled: "Annulée",
};

/** Colonnes du tableau, dans l'ordre (« Annulé » reste dans la vue liste). */
export const BOARD_STATUSES = ["backlog", "open", "in_progress", "waiting_client", "resolved"] as const satisfies readonly TicketStatus[];

/** Priorité d'une tâche, façon Linear. */
export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Sans priorité",
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};

/** Espace interne (perso, SaaS) ou espace d'un client. */
export const WORKSPACE_KINDS = ["client", "internal"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];
/** Couleurs d'espace proposées (pastilles, en-têtes). */
export const WORKSPACE_COLORS = ["blue", "violet", "green", "orange", "pink", "teal", "slate"] as const;
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

export const statusLabel = (kind: TicketKind, status: TicketStatus, viewer: "admin" | "client") =>
  (kind === "task"
    ? viewer === "admin" ? TASK_STATUS_LABELS : TASK_STATUS_LABELS_CLIENT
    : viewer === "admin" ? TICKET_STATUS_LABELS : TICKET_STATUS_LABELS_CLIENT)[status];

/** Vu par l'admin. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Plus tard",
  canceled: "Annulé",
  open: "À traiter",
  in_progress: "En cours",
  waiting_client: "En attente du client",
  resolved: "Résolu",
};

/** Vu par le client (vouvoiement). */
export const TICKET_STATUS_LABELS_CLIENT: Record<TicketStatus, string> = {
  backlog: "Plus tard",
  canceled: "Annulée",
  open: "Envoyée",
  in_progress: "En cours de traitement",
  waiting_client: "Réponse reçue",
  resolved: "Résolue",
};
/** Ce qu'il faut pour proposer un client dans une liste déroulante. */
export type ClientOption = { id: string; name: string };

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

// ─── Réunions ────────────────────────────────────────────────────────

/** draft = en cours d'enregistrement ou à analyser ; ready = analysée ; failed = analyse en échec. */
export const MEETING_STATUSES = ["draft", "ready", "failed"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Tâche proposée par Claude à partir d'une réunion, en attente de ta décision. */
export interface MeetingProposal {
  title: string;
  description: string;
  priority: TaskPriority;
  /** "owner", un id de contact de l'espace, ou null. */
  assignee: string | null;
  project_id: string | null;
  due_on: string | null;
  labels: string[];
  /** Ticket créé à partir de cette proposition (null tant qu'elle n'est pas retenue). */
  ticket_id: string | null;
}
