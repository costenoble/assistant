import "server-only";
import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects, ticketMessages, tickets } from "@/lib/db/schema";
import type { TicketStatus } from "@/lib/db/types";

export const TICKET_FILTERS = {
  todo: { label: "À traiter", statuses: ["open", "in_progress"] },
  waiting: { label: "En attente du client", statuses: ["waiting_client"] },
  resolved: { label: "Résolus", statuses: ["resolved"] },
} as const satisfies Record<string, { label: string; statuses: TicketStatus[] }>;
export type TicketFilter = keyof typeof TICKET_FILTERS;

const listColumns = {
  id: tickets.id,
  number: tickets.number,
  subject: tickets.subject,
  status: tickets.status,
  urgent: tickets.urgent,
  last_message_at: tickets.last_message_at,
  last_client_message_at: tickets.last_client_message_at,
  created_at: tickets.created_at,
  client_id: tickets.client_id,
  client_name: clients.name,
  contact_name: clientContacts.full_name,
};

function list(db: Db, where: SQL) {
  return db
    .select(listColumns)
    .from(tickets)
    .innerJoin(clients, eq(clients.id, tickets.client_id))
    .leftJoin(clientContacts, eq(clientContacts.id, tickets.contact_id))
    .where(where);
}

/** Liste admin. « À traiter » : les bloquants d'abord, puis la plus ancienne attente. */
export async function listTickets(db: Db, filter: TicketFilter) {
  const where = inArray(tickets.status, [...TICKET_FILTERS[filter].statuses]);
  return filter === "todo"
    ? list(db, where).orderBy(desc(tickets.urgent), asc(tickets.last_client_message_at)).limit(200)
    : list(db, where).orderBy(desc(tickets.last_message_at)).limit(200);
}

export async function getClientTickets(db: Db, clientId: string) {
  return list(db, eq(tickets.client_id, clientId)).orderBy(desc(tickets.last_message_at)).limit(50);
}

export async function countOpenTickets(db: Db) {
  return db.$count(tickets, eq(tickets.status, "open"));
}

/** Un ticket complet pour l'admin, notes internes comprises. */
export async function getTicketDetail(db: Db, ticketId: string) {
  const [row] = await db
    .select({
      ticket: tickets,
      client: { id: clients.id, name: clients.name },
      contact: { id: clientContacts.id, name: clientContacts.full_name, email: clientContacts.email, portal: clientContacts.portal_access },
      project: { id: projects.id, name: projects.name },
    })
    .from(tickets)
    .innerJoin(clients, eq(clients.id, tickets.client_id))
    .leftJoin(clientContacts, eq(clientContacts.id, tickets.contact_id))
    .leftJoin(projects, eq(projects.id, tickets.project_id))
    .where(eq(tickets.id, ticketId));
  if (!row) return null;
  const messages = await db
    .select({
      id: ticketMessages.id,
      author: ticketMessages.author,
      body: ticketMessages.body,
      internal: ticketMessages.internal,
      created_at: ticketMessages.created_at,
      contact_name: clientContacts.full_name,
    })
    .from(ticketMessages)
    .leftJoin(clientContacts, eq(clientContacts.id, ticketMessages.contact_id))
    .where(eq(ticketMessages.ticket_id, ticketId))
    .orderBy(asc(ticketMessages.created_at));
  return { ...row, messages };
}
