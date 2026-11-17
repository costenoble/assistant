import "server-only";
import { aliasedTable, and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects, tickets } from "@/lib/db/schema";

/**
 * Espaces de travail. Un espace = un client (ou un espace interne) : ses
 * membres sont les contacts qui ont accès au portail, ses tâches sont les
 * tickets de sorte `task`.
 */

const author = aliasedTable(clientContacts, "author");
const assignee = aliasedTable(clientContacts, "assignee");

/** Colonnes d'une tâche pour le tableau et la liste (communes à l'admin et au portail). */
export const taskCardColumns = {
  id: tickets.id,
  number: tickets.number,
  subject: tickets.subject,
  status: tickets.status,
  priority: tickets.priority,
  labels: tickets.labels,
  due_on: tickets.due_on,
  position: tickets.position,
  assigned_to_owner: tickets.assigned_to_owner,
  assignee_contact_id: tickets.assignee_contact_id,
  assignee_name: assignee.full_name,
  author_name: author.full_name,
  project_id: tickets.project_id,
  project_name: projects.name,
  last_message_at: tickets.last_message_at,
  // Nombre de messages visibles du client (les notes internes ne comptent pas).
  replies: sql<number>`(select count(*)::int from ticket_messages m where m.ticket_id = ${tickets.id} and not m.internal)`,
};
export type TaskCard = {
  id: string;
  number: number;
  subject: string;
  status: (typeof tickets.$inferSelect)["status"];
  priority: (typeof tickets.$inferSelect)["priority"];
  labels: string[];
  due_on: string | null;
  position: number;
  assigned_to_owner: boolean;
  assignee_contact_id: string | null;
  assignee_name: string | null;
  author_name: string | null;
  project_id: string | null;
  project_name: string | null;
  last_message_at: Date;
  replies: number;
};

/** Tâches d'un espace. `extra` restreint davantage (portail : hors brouillons). */
export function selectTasks(db: Db, workspaceId: string, extra?: SQL) {
  return db
    .select(taskCardColumns)
    .from(tickets)
    .leftJoin(projects, eq(projects.id, tickets.project_id))
    .leftJoin(author, eq(author.id, tickets.contact_id))
    .leftJoin(assignee, eq(assignee.id, tickets.assignee_contact_id))
    .where(and(eq(tickets.client_id, workspaceId), eq(tickets.kind, "task"), extra))
    .orderBy(asc(tickets.position), desc(tickets.last_message_at));
}

/** Liste admin : tous les espaces actifs, avec leurs compteurs. */
export async function listWorkspaces(db: Db) {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      kind: clients.kind,
      color: clients.color,
      status: clients.status,
      members: sql<number>`(select count(*)::int from client_contacts cc where cc.client_id = clients.id and cc.portal_access)`,
      projects: sql<number>`(select count(*)::int from projects p where p.client_id = clients.id and p.status <> 'archived')`,
      todo: sql<number>`(select count(*)::int from tickets t where t.client_id = clients.id and t.kind = 'task' and t.status in ('open', 'in_progress'))`,
      to_validate: sql<number>`(select count(*)::int from tickets t where t.client_id = clients.id and t.kind = 'task' and t.status = 'waiting_client')`,
    })
    .from(clients)
    .where(ne(clients.status, "archived"))
    .orderBy(asc(clients.kind), asc(clients.name));
}

/** Un espace complet pour l'admin. */
export async function getWorkspace(db: Db, workspaceId: string) {
  const [workspace] = await db.select().from(clients).where(eq(clients.id, workspaceId));
  if (!workspace) return null;
  const [contacts, workspaceProjects, tasks] = await Promise.all([
    db.select().from(clientContacts).where(eq(clientContacts.client_id, workspaceId)).orderBy(asc(clientContacts.full_name)),
    db.select().from(projects).where(and(eq(projects.client_id, workspaceId), ne(projects.status, "archived"))).orderBy(desc(projects.updated_at)),
    selectTasks(db, workspaceId),
  ]);
  return { workspace, contacts, projects: workspaceProjects, tasks: tasks as TaskCard[] };
}
