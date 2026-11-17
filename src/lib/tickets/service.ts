import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { items, ticketMessages, tickets } from "@/lib/db/schema";
import type { ItemStatus, TaskPriority, Ticket, TicketKind, TicketMessage, TicketStatus } from "@/lib/db/types";
import { fromParis } from "@/lib/time/paris";
import { recomputeOne } from "@/lib/items/repo";

/**
 * Cycle de vie d'un ticket. Ces fonctions écrivent sans contrôle d'accès :
 * l'appelant a déjà vérifié qui agit (requireOwner, ou lib/auth/access pour le portail).
 *
 * Chaque ticket a un item miroir (kind 'ticket') qui le fait apparaître dans le
 * flux admin, trié par le moteur de priorité. Son statut suit celui du ticket.
 */

const ITEM_STATUS: Record<TicketStatus, ItemStatus> = {
  backlog: "waiting", // pas maintenant : hors de « À faire maintenant »
  open: "todo",
  in_progress: "in_progress",
  waiting_client: "waiting",
  resolved: "done",
  canceled: "archived",
};

/** Statut de l'item miroir : une tâche assignée à quelqu'un d'autre que toi attend ce quelqu'un. */
function itemStatusFor(t: Ticket): ItemStatus {
  const status = ITEM_STATUS[t.status];
  const someoneElse = t.kind === "task" && !t.assigned_to_owner && t.assignee_contact_id !== null;
  return someoneElse && (status === "todo" || status === "in_progress") ? "waiting" : status;
}

/** Échéance d'une tâche (une date) → 18 h, heure de Paris, pour le moteur de priorité. */
function dueAt(dueOn: string | null): Date | null {
  if (!dueOn) return null;
  const [y, m, d] = dueOn.split("-").map(Number);
  return fromParis(y!, m!, d!, 18, 0);
}

export const ticketTitle = (t: Pick<Ticket, "number" | "subject">) => `#${t.number} · ${t.subject}`;

/** Recopie l'état du ticket sur son item, puis recalcule sa priorité. */
async function syncItem(db: Db, ticket: Ticket, excerpt?: string) {
  const fields = {
    kind: "ticket" as const,
    context: "freelance" as const,
    status: itemStatusFor(ticket),
    due_at: dueAt(ticket.due_on),
    title: ticketTitle(ticket).slice(0, 500),
    url: `/tickets/${ticket.id}`,
    client_id: ticket.client_id,
    project_id: ticket.project_id,
    ...(excerpt !== undefined ? { body: excerpt.slice(0, 1000) } : {}),
  };
  let itemId = ticket.item_id;
  if (itemId) {
    await db.update(items).set(fields).where(eq(items.id, itemId));
  } else {
    const [created] = await db.insert(items).values({ ...fields, metadata: { ticket: ticket.number } }).returning({ id: items.id });
    itemId = created!.id;
    await db.update(tickets).set({ item_id: itemId }).where(eq(tickets.id, ticket.id));
  }
  await recomputeOne(db, itemId);
}

/** Champs d'une tâche façon Linear (optionnels à la création). */
export interface TaskFields {
  status?: TicketStatus;
  priority?: TaskPriority;
  description?: string | null;
  /** "owner" = toi ; un id de contact ; null = personne. */
  assignee?: "owner" | string | null;
  dueOn?: string | null;
  labels?: string[];
  projectId?: string | null;
}

/** Colonnes de tickets correspondant à une modification de tâche. */
function taskColumns(f: TaskFields) {
  const cols: Partial<typeof tickets.$inferInsert> = {};
  if (f.status !== undefined) cols.status = f.status;
  if (f.priority !== undefined) {
    cols.priority = f.priority;
    cols.urgent = f.priority === "urgent";
  }
  if (f.description !== undefined) cols.description = f.description;
  if (f.assignee !== undefined) {
    cols.assigned_to_owner = f.assignee === "owner";
    cols.assignee_contact_id = f.assignee && f.assignee !== "owner" ? f.assignee : null;
  }
  if (f.dueOn !== undefined) cols.due_on = f.dueOn;
  if (f.labels !== undefined) cols.labels = [...new Set(f.labels.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  if (f.projectId !== undefined) cols.project_id = f.projectId;
  return cols;
}

/** Position en bas d'une colonne du tableau. */
async function nextPosition(db: Db, clientId: string, status: TicketStatus) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${tickets.position})` })
    .from(tickets)
    .where(and(eq(tickets.client_id, clientId), eq(tickets.status, status)));
  return (row?.max ?? 0) + 1;
}

export interface NewTicket {
  /** request (défaut) = demande au support ; task = tâche d'un espace de travail. */
  kind?: TicketKind;
  /** Propriétés d'une tâche (statut initial, priorité, assigné…). */
  task?: TaskFields;
  clientId: string;
  projectId?: string | null;
  /** Contact auteur (portail). Absent quand l'admin ouvre le ticket. */
  contactId?: string | null;
  author: "client" | "admin";
  subject: string;
  body: string;
  urgent?: boolean;
}

export async function createTicket(db: Db, input: NewTicket): Promise<Ticket> {
  const kind = input.kind ?? "request";
  const now = new Date();
  // Demande ouverte par l'admin pour le client : la balle est dans le camp du client.
  const status: TicketStatus =
    input.task?.status ?? (input.author === "client" || kind === "task" ? "open" : "waiting_client");
  // Une tâche est à toi par défaut (c'est à toi qu'on la confie) ; « bloquant » = priorité urgente.
  // Pour une tâche, le texte de départ est sa description ; le fil ne contient que les échanges.
  const extra =
    kind === "task"
      ? taskColumns({
          assignee: "owner",
          ...(input.urgent ? { priority: "urgent" as const } : {}),
          ...input.task,
          description: input.task?.description ?? (input.body.trim() || null),
        })
      : {};
  const [ticket] = await db
    .insert(tickets)
    .values({
      kind,
      client_id: input.clientId,
      project_id: input.projectId ?? null,
      contact_id: input.contactId ?? null,
      subject: input.subject.slice(0, 200),
      urgent: input.urgent ?? false,
      status,
      position: await nextPosition(db, input.clientId, status),
      ...extra,
      last_client_message_at: input.author === "client" ? now : null,
      last_message_at: now,
    })
    .returning();
  if (kind === "request") {
    await db.insert(ticketMessages).values({
      ticket_id: ticket!.id,
      author: input.author,
      contact_id: input.contactId ?? null,
      body: input.body,
    });
  }
  await syncItem(db, ticket!, input.body);
  return (await getTicketRow(db, ticket!.id))!;
}

export interface NewMessage {
  author: "client" | "admin";
  contactId?: string | null;
  body: string;
  /** Note interne de l'admin : invisible du client, ne change pas le statut. */
  internal?: boolean;
  /** Réponse de l'admin qui clôt la demande. */
  resolve?: boolean;
  /** Statut voulu par l'admin avec son message (ex. « envoyer en validation »). Prime sur la règle par défaut. */
  status?: TicketStatus;
}

/**
 * Ajoute un message et fait avancer le statut :
 * - le client écrit → « à traiter » si elle attendait sa réponse ou était résolue (correction demandée) ;
 * - l'admin répond à une demande → « en attente du client », ou « résolu » s'il le demande ;
 * - l'admin commente une tâche → rien ne change, sauf statut explicite (envoyer en validation, fait) ;
 * - une note interne ne change rien pour le client.
 */
export async function addTicketMessage(db: Db, ticketId: string, msg: NewMessage) {
  const ticket = await getTicketRow(db, ticketId);
  if (!ticket) throw new Error("Ticket introuvable");
  const now = new Date();
  const internal = msg.author === "admin" && !!msg.internal;

  let status = ticket.status;
  if (msg.author === "client") {
    if (status === "waiting_client" || status === "resolved") status = "open";
  } else if (!internal) {
    if (msg.status) status = msg.status;
    else if (msg.resolve) status = "resolved";
    else if (ticket.kind === "request") status = "waiting_client";
  }

  const [message] = await db
    .insert(ticketMessages)
    .values({ ticket_id: ticketId, author: msg.author, contact_id: msg.contactId ?? null, body: msg.body, internal })
    .returning();
  const [updated] = await db
    .update(tickets)
    .set({
      status,
      last_message_at: now,
      ...(msg.author === "client" ? { last_client_message_at: now } : {}),
    })
    .where(eq(tickets.id, ticketId))
    .returning();
  await syncItem(db, updated!, msg.author === "client" ? msg.body : undefined);
  return { ticket: updated!, message: message!, reopened: ticket.status !== "open" && status === "open" };
}

/** Le client valide une tâche qu'on lui a soumise : une trace dans le fil, puis « fait ». */
export async function clientValidateTask(db: Db, ticketId: string, contactId: string) {
  const ticket = await getTicketRow(db, ticketId);
  if (!ticket || ticket.kind !== "task" || ticket.status !== "waiting_client") return null;
  await db.insert(ticketMessages).values({ ticket_id: ticketId, author: "client", contact_id: contactId, body: "A validé la tâche." });
  const [updated] = await db
    .update(tickets)
    .set({ status: "resolved", last_message_at: new Date() })
    .where(eq(tickets.id, ticketId))
    .returning();
  await syncItem(db, updated!);
  return updated!;
}

export async function setTicketStatus(db: Db, ticketId: string, status: TicketStatus): Promise<Ticket | null> {
  return updateTask(db, ticketId, { status });
}

/** Modifie les propriétés d'une tâche (ou le statut d'une demande) et resynchronise le flux. */
export async function updateTask(db: Db, ticketId: string, fields: TaskFields & { subject?: string }): Promise<Ticket | null> {
  const before = await getTicketRow(db, ticketId);
  if (!before) return null;
  const cols = taskColumns(fields);
  if (fields.subject !== undefined) cols.subject = fields.subject.slice(0, 200);
  // Changement de colonne sans position donnée : en bas de la nouvelle colonne.
  if (fields.status !== undefined && fields.status !== before.status) cols.position = await nextPosition(db, before.client_id, fields.status);
  if (!Object.keys(cols).length) return before;
  const [updated] = await db.update(tickets).set(cols).where(eq(tickets.id, ticketId)).returning();
  await syncItem(db, updated!);
  return updated!;
}

/** Glisser-déposer : nouvelle colonne et position (entre ses voisines). */
export async function moveTask(db: Db, ticketId: string, status: TicketStatus, position: number): Promise<Ticket | null> {
  const before = await getTicketRow(db, ticketId);
  if (!before) return null;
  const [updated] = await db.update(tickets).set({ status, position }).where(eq(tickets.id, ticketId)).returning();
  await syncItem(db, updated!);
  return updated!;
}

export async function getTicketRow(db: Db, ticketId: string): Promise<Ticket | null> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  return row ?? null;
}

export type { Ticket, TicketMessage };
