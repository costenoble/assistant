import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
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

// ─── Demandes et tâches de projet (tickets) ──────────────────────────

/** Un ticket est visible du client s'il est chez l'un de ses clients et hors projet en brouillon. */
const visibleToPortal = (clientIds: string[]) =>
  and(inArray(tickets.client_id, clientIds), or(isNull(tickets.project_id), ne(projects.status, "draft")));

const portalTicketColumns = {
  id: tickets.id,
  number: tickets.number,
  kind: tickets.kind,
  subject: tickets.subject,
  status: tickets.status,
  urgent: tickets.urgent,
  client_id: tickets.client_id,
  project_id: tickets.project_id,
  project_name: projects.name,
  last_message_at: tickets.last_message_at,
  created_at: tickets.created_at,
};

/** Demandes et tâches visibles par un client, la plus récente d'abord. `kind` pour n'en garder qu'une sorte. */
export async function getPortalTickets(db: Db, clientIds: string[], kind?: "request" | "task") {
  if (!clientIds.length) return [];
  return db
    .select(portalTicketColumns)
    .from(tickets)
    .leftJoin(projects, eq(projects.id, tickets.project_id))
    .where(and(visibleToPortal(clientIds), kind ? eq(tickets.kind, kind) : undefined))
    .orderBy(desc(tickets.last_message_at));
}

/**
 * Une demande ou une tâche et ses messages, si elle est visible du contact.
 * Les notes internes de l'admin ne sortent jamais d'ici.
 */
export async function getPortalTicket(db: Db, clientIds: string[], ticketId: string) {
  if (!clientIds.length) return null;
  const [ticket] = await db
    .select(portalTicketColumns)
    .from(tickets)
    .leftJoin(projects, eq(projects.id, tickets.project_id))
    .where(and(eq(tickets.id, ticketId), visibleToPortal(clientIds)));
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

/** Un projet visible du contact (son client, hors brouillon), avec ses tâches partagées. */
export async function getPortalProject(db: Db, clientIds: string[], projectId: string) {
  const project = (await getPortalProjects(db, clientIds)).find((p) => p.id === projectId);
  if (!project) return null;
  const tasks = await db
    .select({
      ...portalTicketColumns,
      author_name: clientContacts.full_name,
      // Nombre de messages visibles du client, pour l'aperçu.
      replies: sql<number>`(select count(*)::int from ticket_messages m where m.ticket_id = tickets.id and not m.internal)`,
    })
    .from(tickets)
    .leftJoin(projects, eq(projects.id, tickets.project_id))
    .leftJoin(clientContacts, eq(clientContacts.id, tickets.contact_id))
    .where(and(eq(tickets.project_id, project.id), eq(tickets.kind, "task")))
    .orderBy(desc(tickets.urgent), desc(tickets.last_message_at));
  return { project, tasks };
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
