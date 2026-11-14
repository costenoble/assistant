import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects, ticketMessages, tickets } from "@/lib/db/schema";

/**
 * Qui a accès à quoi. C'est LE point de passage du portail : toute lecture
 * faite pour un client part de `getPortalAccess` et reste bornée à ses
 * `clientIds`. Aucune page du portail ne doit interroger la base autrement.
 */

export function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Contacts actifs (accès portail ouvert) pour cette adresse, avec leur client. */
export async function getPortalAccess(db: Db, email: string) {
  const rows = await db
    .select({ contact: clientContacts, client: clients })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.client_id))
    .where(
      and(
        eq(clientContacts.email, email.trim().toLowerCase()),
        eq(clientContacts.portal_access, true),
        ne(clients.status, "archived"),
      ),
    )
    .orderBy(clients.name);
  if (!rows.length) return null;
  return {
    contact: rows[0]!.contact,
    clients: rows.map((r) => r.client),
    clientIds: rows.map((r) => r.client.id),
  };
}

/** Cette adresse peut-elle recevoir un lien de connexion ? (admin ou contact avec accès portail) */
export async function canSignIn(db: Db, email: string, ownerEmail: string) {
  return sameEmail(email, ownerEmail) || (await getPortalAccess(db, email)) !== null;
}

/** Projets visibles par un client : les siens, hors brouillons. */
export async function getPortalProjects(db: Db, clientIds: string[]) {
  if (!clientIds.length) return [];
  return db
    .select()
    .from(projects)
    .where(and(inArray(projects.client_id, clientIds), ne(projects.status, "draft")))
    .orderBy(desc(projects.updated_at));
}

// ─── Demandes (tickets) ──────────────────────────────────────────────

/** Demandes visibles par un client : celles de ses clients, la plus récente d'abord. */
export async function getPortalTickets(db: Db, clientIds: string[]) {
  if (!clientIds.length) return [];
  return db
    .select({
      id: tickets.id,
      number: tickets.number,
      subject: tickets.subject,
      status: tickets.status,
      client_id: tickets.client_id,
      last_message_at: tickets.last_message_at,
      created_at: tickets.created_at,
    })
    .from(tickets)
    .where(inArray(tickets.client_id, clientIds))
    .orderBy(desc(tickets.last_message_at));
}

/**
 * Une demande et ses messages, si elle appartient à l'un des clients du
 * contact. Les notes internes de l'admin ne sortent jamais d'ici.
 */
export async function getPortalTicket(db: Db, clientIds: string[], ticketId: string) {
  if (!clientIds.length) return null;
  const [ticket] = await db
    .select({
      id: tickets.id,
      number: tickets.number,
      subject: tickets.subject,
      status: tickets.status,
      client_id: tickets.client_id,
      project_id: tickets.project_id,
      created_at: tickets.created_at,
    })
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), inArray(tickets.client_id, clientIds)));
  if (!ticket) return null;
  const messages = await db
    .select({
      id: ticketMessages.id,
      author: ticketMessages.author,
      body: ticketMessages.body,
      created_at: ticketMessages.created_at,
      contact_name: clientContacts.full_name,
    })
    .from(ticketMessages)
    .leftJoin(clientContacts, eq(clientContacts.id, ticketMessages.contact_id))
    .where(and(eq(ticketMessages.ticket_id, ticketId), eq(ticketMessages.internal, false)))
    .orderBy(asc(ticketMessages.created_at));
  return { ...ticket, messages };
}

/**
 * Client auquel rattacher une nouvelle demande. Un projet choisi doit être
 * visible du contact (son client, hors brouillon) ; sans projet, le client
 * choisi doit être l'un des siens. null = refus.
 */
export async function resolvePortalTicketTarget(
  db: Db,
  clientIds: string[],
  wanted: { clientId?: string | null; projectId?: string | null },
): Promise<{ clientId: string; projectId: string | null } | null> {
  if (wanted.projectId) {
    const project = (await getPortalProjects(db, clientIds)).find((p) => p.id === wanted.projectId);
    if (!project) return null;
    if (wanted.clientId && wanted.clientId !== project.client_id) return null;
    return { clientId: project.client_id, projectId: project.id };
  }
  const clientId = wanted.clientId ?? (clientIds.length === 1 ? clientIds[0]! : null);
  if (!clientId || !clientIds.includes(clientId)) return null;
  return { clientId, projectId: null };
}
