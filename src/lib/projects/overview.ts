import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, items, meetings, projectMilestones, projectUpdates, projects, ticketMessages, tickets } from "@/lib/db/schema";
import type { ProjectHealth } from "@/lib/db/types";
import { selectTasks, type TaskCard } from "@/lib/workspaces/queries";

/**
 * Projets vus comme des objets à part entière : cartes avec avancement,
 * page d'un projet (jalons, points d'avancement, tâches, réunions), fil
 * d'activité. `portal: true` = vue d'un membre : jamais de brouillon, jamais
 * de note interne, seulement les réunions partagées.
 */

// Sous-requêtes corrélées : noms de colonnes en clair (dans une requête sur une seule table,
// Drizzle omet le nom de la table, et « id » désignerait alors celui de la sous-requête).
const taskCount = (cond: string) =>
  sql<number>`(select count(*)::int from tickets t where t.project_id = projects.id and t.kind = 'task' and ${sql.raw(cond)})`;

export interface ProjectCardData {
  id: string;
  name: string;
  description: string | null;
  color: (typeof projects.$inferSelect)["color"];
  status: (typeof projects.$inferSelect)["status"];
  due_on: string | null;
  lead: string | null;
  total: number;
  done: number;
  to_validate: number;
  open: number;
  health: ProjectHealth | null;
  updated_at: Date;
}

/** Cartes des projets d'un espace (archivés exclus ; brouillons exclus côté membre). */
export async function projectCards(db: Db, workspaceId: string, opts: { portal: boolean }): Promise<ProjectCardData[]> {
  const lead = sql<string | null>`(select c.full_name from client_contacts c where c.id = projects.lead_contact_id)`;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      status: projects.status,
      due_on: projects.due_on,
      lead_is_owner: projects.lead_is_owner,
      lead_name: lead,
      total: taskCount("t.status <> 'canceled'"),
      done: taskCount("t.status = 'resolved'"),
      to_validate: taskCount("t.status = 'waiting_client'"),
      open: taskCount("t.status in ('open', 'in_progress')"),
      health: sql<ProjectHealth | null>`(select u.health from project_updates u where u.project_id = projects.id order by u.created_at desc limit 1)`,
      updated_at: projects.updated_at,
    })
    .from(projects)
    .where(and(eq(projects.client_id, workspaceId), ne(projects.status, "archived"), opts.portal ? ne(projects.status, "draft") : undefined))
    .orderBy(asc(sql`case ${projects.status} when 'active' then 0 when 'review' then 1 when 'draft' then 2 else 3 end`), desc(projects.updated_at));
  return rows.map(({ lead_is_owner, lead_name, ...r }) => ({ ...r, lead: lead_name ?? (lead_is_owner ? "owner" : null) }));
}

/** Tout ce qu'affiche la page d'un projet. null si introuvable (ou brouillon vu par un membre). */
export async function getProjectPage(db: Db, projectId: string, opts: { portal: boolean }) {
  const [row] = await db
    .select({ project: projects, workspace: { id: clients.id, name: clients.name, color: clients.color } })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.client_id))
    .where(eq(projects.id, projectId));
  if (!row || (opts.portal && row.project.status === "draft")) return null;
  const p = row.project;
  const [milestones, updates, tasks, meetingRows, members, [lead]] = await Promise.all([
    db
      .select({
        id: projectMilestones.id,
        name: projectMilestones.name,
        due_on: projectMilestones.due_on,
        total: sql<number>`(select count(*)::int from tickets t where t.milestone_id = project_milestones.id and t.status <> 'canceled')`,
        done: sql<number>`(select count(*)::int from tickets t where t.milestone_id = project_milestones.id and t.status = 'resolved')`,
      })
      .from(projectMilestones)
      .where(eq(projectMilestones.project_id, projectId))
      .orderBy(asc(projectMilestones.position), asc(projectMilestones.created_at)),
    db.select().from(projectUpdates).where(eq(projectUpdates.project_id, projectId)).orderBy(desc(projectUpdates.created_at)).limit(20),
    selectTasks(db, p.client_id, eq(tickets.project_id, projectId)) as Promise<TaskCard[]>,
    db
      .select({ id: meetings.id, title: meetings.title, started_at: meetings.started_at, summary: meetings.summary, decisions: meetings.decisions, shared: meetings.shared, status: meetings.status })
      .from(meetings)
      .where(and(eq(meetings.project_id, projectId), opts.portal ? and(eq(meetings.shared, true), eq(meetings.status, "ready")) : undefined))
      .orderBy(desc(meetings.started_at))
      .limit(20),
    db
      .select({ id: clientContacts.id, name: clientContacts.full_name })
      .from(clientContacts)
      .where(and(eq(clientContacts.client_id, p.client_id), opts.portal ? eq(clientContacts.portal_access, true) : undefined))
      .orderBy(asc(clientContacts.full_name)),
    p.lead_contact_id ? db.select({ name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.id, p.lead_contact_id)) : Promise.resolve([]),
  ]);
  const live = tasks.filter((t) => t.status !== "canceled");
  return {
    project: p,
    workspace: row.workspace,
    lead: lead?.name ?? (p.lead_is_owner ? "owner" : null),
    milestones,
    updates,
    tasks,
    meetings: meetingRows,
    members,
    progress: { total: live.length, done: live.filter((t) => t.status === "resolved").length },
  };
}

// ─── Activité ────────────────────────────────────────────────────────

export interface ActivityEvent {
  at: Date;
  kind: "task_created" | "comment" | "task_done" | "update" | "meeting" | "project_created";
  /** Qui : nom d'un membre, ou null = toi. */
  who: string | null;
  text: string;
  href: { ticketId?: string; projectId?: string; meetingId?: string };
}

/**
 * Ce qui s'est passé récemment dans un espace ou un projet : tâches créées et
 * terminées, commentaires, points d'avancement, réunions partagées.
 */
export async function activityFeed(db: Db, scope: { workspaceId: string; projectId?: string }, opts: { portal: boolean; limit?: number }): Promise<ActivityEvent[]> {
  const limit = opts.limit ?? 25;
  const inScope: SQL = scope.projectId ? eq(tickets.project_id, scope.projectId) : eq(tickets.client_id, scope.workspaceId);
  // Côté membre : rien qui touche un projet en brouillon.
  const visible = opts.portal ? or(sql`${tickets.project_id} is null`, sql`exists (select 1 from projects p where p.id = ${tickets.project_id} and p.status <> 'draft')`) : undefined;
  const projectScope = scope.projectId
    ? eq(projects.id, scope.projectId)
    : and(eq(projects.client_id, scope.workspaceId), opts.portal ? ne(projects.status, "draft") : undefined);

  const [created, comments, done, updates, meetingRows, newProjects] = await Promise.all([
    db
      .select({ at: tickets.created_at, id: tickets.id, subject: tickets.subject, who: clientContacts.full_name })
      .from(tickets)
      .leftJoin(clientContacts, eq(clientContacts.id, tickets.contact_id))
      .where(and(inScope, eq(tickets.kind, "task"), visible))
      .orderBy(desc(tickets.created_at))
      .limit(limit),
    db
      .select({ at: ticketMessages.created_at, id: tickets.id, subject: tickets.subject, who: clientContacts.full_name, author: ticketMessages.author })
      .from(ticketMessages)
      .innerJoin(tickets, eq(tickets.id, ticketMessages.ticket_id))
      .leftJoin(clientContacts, eq(clientContacts.id, ticketMessages.contact_id))
      .where(and(inScope, eq(ticketMessages.internal, false), visible))
      .orderBy(desc(ticketMessages.created_at))
      .limit(limit),
    db
      .select({ at: items.completed_at, id: tickets.id, subject: tickets.subject })
      .from(tickets)
      .innerJoin(items, eq(items.id, tickets.item_id))
      .where(and(inScope, eq(tickets.kind, "task"), eq(tickets.status, "resolved"), visible, sql`${items.completed_at} is not null`))
      .orderBy(desc(items.completed_at))
      .limit(limit),
    db
      .select({ at: projectUpdates.created_at, health: projectUpdates.health, project: projects.name, projectId: projects.id })
      .from(projectUpdates)
      .innerJoin(projects, eq(projects.id, projectUpdates.project_id))
      .where(projectScope)
      .orderBy(desc(projectUpdates.created_at))
      .limit(limit),
    db
      .select({ at: meetings.started_at, id: meetings.id, title: meetings.title })
      .from(meetings)
      .where(
        and(
          scope.projectId ? eq(meetings.project_id, scope.projectId) : eq(meetings.client_id, scope.workspaceId),
          eq(meetings.status, "ready"),
          opts.portal ? eq(meetings.shared, true) : undefined,
        ),
      )
      .orderBy(desc(meetings.started_at))
      .limit(limit),
    scope.projectId
      ? Promise.resolve([])
      : db
          .select({ at: projects.created_at, id: projects.id, name: projects.name, who: clientContacts.full_name })
          .from(projects)
          .leftJoin(clientContacts, eq(clientContacts.id, projects.created_by_contact_id))
          .where(projectScope)
          .orderBy(desc(projects.created_at))
          .limit(limit),
  ]);

  const HEALTH = { on_track: "en bonne voie", at_risk: "à risque", off_track: "en retard" } as const;
  const events: ActivityEvent[] = [
    ...created.map((r) => ({ at: r.at, kind: "task_created" as const, who: r.who, text: `a ajouté la tâche « ${r.subject} »`, href: { ticketId: r.id } })),
    ...comments.map((r) => ({ at: r.at, kind: "comment" as const, who: r.author === "admin" ? null : r.who, text: `a commenté « ${r.subject} »`, href: { ticketId: r.id } })),
    ...done.map((r) => ({ at: r.at!, kind: "task_done" as const, who: null, text: `a terminé « ${r.subject} »`, href: { ticketId: r.id } })),
    ...updates.map((r) => ({ at: r.at, kind: "update" as const, who: null, text: `a publié un point d'avancement sur « ${r.project} » : ${HEALTH[r.health]}`, href: { projectId: r.projectId } })),
    ...meetingRows.map((r) => ({ at: r.at, kind: "meeting" as const, who: null, text: `a partagé le compte rendu « ${r.title} »`, href: { meetingId: r.id } })),
    ...newProjects.map((r) => ({ at: r.at, kind: "project_created" as const, who: r.who, text: `a créé le projet « ${r.name} »`, href: { projectId: r.id } })),
  ];
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Les projets d'un espace pour les listes déroulantes (brouillons exclus côté membre). */
export async function projectOptions(db: Db, workspaceIds: string[], opts: { portal: boolean }) {
  if (!workspaceIds.length) return [];
  return db
    .select({ id: projects.id, name: projects.name, client_id: projects.client_id })
    .from(projects)
    .where(and(inArray(projects.client_id, workspaceIds), ne(projects.status, "archived"), opts.portal ? ne(projects.status, "draft") : undefined))
    .orderBy(asc(projects.name));
}
