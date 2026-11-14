import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { items, ticketMessages, tickets } from "@/lib/db/schema";
import type { ItemStatus, Ticket, TicketMessage, TicketStatus } from "@/lib/db/types";
import { recomputeOne } from "@/lib/items/repo";

/**
 * Cycle de vie d'un ticket. Ces fonctions écrivent sans contrôle d'accès :
 * l'appelant a déjà vérifié qui agit (requireOwner, ou lib/auth/access pour le portail).
 *
 * Chaque ticket a un item miroir (kind 'ticket') qui le fait apparaître dans le
 * flux admin, trié par le moteur de priorité. Son statut suit celui du ticket.
 */

const ITEM_STATUS: Record<TicketStatus, ItemStatus> = {
  open: "todo",
  in_progress: "in_progress",
  waiting_client: "waiting",
  resolved: "done",
};

export const ticketTitle = (t: Pick<Ticket, "number" | "subject">) => `#${t.number} · ${t.subject}`;

/** Recopie l'état du ticket sur son item, puis recalcule sa priorité. */
async function syncItem(db: Db, ticket: Ticket, excerpt?: string) {
  const fields = {
    kind: "ticket" as const,
    context: "freelance" as const,
    status: ITEM_STATUS[ticket.status],
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

export interface NewTicket {
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
  const now = new Date();
  const [ticket] = await db
    .insert(tickets)
    .values({
      client_id: input.clientId,
      project_id: input.projectId ?? null,
      contact_id: input.contactId ?? null,
      subject: input.subject.slice(0, 200),
      urgent: input.urgent ?? false,
      // Ouvert par l'admin pour le compte du client : la balle est dans le camp du client.
      status: input.author === "client" ? "open" : "waiting_client",
      last_client_message_at: input.author === "client" ? now : null,
      last_message_at: now,
    })
    .returning();
  await db.insert(ticketMessages).values({
    ticket_id: ticket!.id,
    author: input.author,
    contact_id: input.contactId ?? null,
    body: input.body,
  });
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
}

/**
 * Ajoute un message et fait avancer le statut :
 * - le client écrit → la demande repasse « à traiter » si elle attendait sa réponse ou était résolue ;
 * - l'admin répond → « en attente du client », ou « résolu » s'il le demande ;
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
    status = msg.resolve ? "resolved" : "waiting_client";
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

export async function setTicketStatus(db: Db, ticketId: string, status: TicketStatus): Promise<Ticket | null> {
  const [updated] = await db.update(tickets).set({ status }).where(eq(tickets.id, ticketId)).returning();
  if (updated) await syncItem(db, updated);
  return updated ?? null;
}

export async function getTicketRow(db: Db, ticketId: string): Promise<Ticket | null> {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  return row ?? null;
}

export type { Ticket, TicketMessage };
