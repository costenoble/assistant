import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects, tickets } from "@/lib/db/schema";

/** Compteurs de tâches d'un projet (sous-requêtes : noms de colonnes en clair, voir clients/page.tsx). */
const counts = {
  todo: sql<number>`(select count(*)::int from tickets t where t.project_id = projects.id and t.kind = 'task' and t.status in ('open', 'in_progress'))`,
  to_validate: sql<number>`(select count(*)::int from tickets t where t.project_id = projects.id and t.kind = 'task' and t.status = 'waiting_client')`,
  done: sql<number>`(select count(*)::int from tickets t where t.project_id = projects.id and t.kind = 'task' and t.status = 'resolved')`,
};

/** Tous les projets non archivés, les plus actifs d'abord. */
export async function listProjects(db: Db) {
  return db
    .select({ project: projects, client: { id: clients.id, name: clients.name }, ...counts })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.client_id))
    .where(ne(projects.status, "archived"))
    .orderBy(asc(clients.name), desc(projects.updated_at));
}

export async function getProjectDetail(db: Db, projectId: string) {
  const [row] = await db
    .select({ project: projects, client: { id: clients.id, name: clients.name } })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.client_id))
    .where(eq(projects.id, projectId));
  if (!row) return null;
  const [tasks, portalContacts] = await Promise.all([
    db
      .select({
        id: tickets.id,
        number: tickets.number,
        subject: tickets.subject,
        status: tickets.status,
        urgent: tickets.urgent,
        last_message_at: tickets.last_message_at,
        last_client_message_at: tickets.last_client_message_at,
        author_name: clientContacts.full_name,
      })
      .from(tickets)
      .leftJoin(clientContacts, eq(clientContacts.id, tickets.contact_id))
      .where(and(eq(tickets.project_id, projectId), eq(tickets.kind, "task")))
      .orderBy(desc(tickets.urgent), desc(tickets.last_message_at)),
    db
      .select({ name: clientContacts.full_name })
      .from(clientContacts)
      .where(and(eq(clientContacts.client_id, row.client.id), eq(clientContacts.portal_access, true))),
  ]);
  return { ...row, tasks, portalContacts };
}
