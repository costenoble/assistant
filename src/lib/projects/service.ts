import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, projectMilestones, projectUpdates, projects, tickets } from "@/lib/db/schema";
import type { ProjectHealth, ProjectStatus, WorkspaceColor } from "@/lib/db/types";

/** Écriture des projets, de leurs jalons et de leurs points d'avancement. */

export interface ProjectInput {
  name: string;
  color?: WorkspaceColor;
  description?: string | null;
  dueOn?: string | null;
  status?: ProjectStatus;
  /** "owner" = toi ; un id de membre ; null = personne. */
  lead?: "owner" | string | null;
}

const leadColumns = (lead: ProjectInput["lead"]) =>
  lead === undefined ? {} : { lead_is_owner: lead === "owner", lead_contact_id: lead && lead !== "owner" ? lead : null };

/** Le membre (ou "owner") doit appartenir à l'espace du projet. */
export async function leadAllowed(db: Db, workspaceId: string, lead: ProjectInput["lead"]) {
  if (lead === undefined || lead === null || lead === "owner") return true;
  const [c] = await db.select({ id: clientContacts.id }).from(clientContacts).where(and(eq(clientContacts.id, lead), eq(clientContacts.client_id, workspaceId)));
  return !!c;
}

export async function createProject(db: Db, workspaceId: string, input: ProjectInput, createdByContactId: string | null = null) {
  const [p] = await db
    .insert(projects)
    .values({
      client_id: workspaceId,
      name: input.name.trim().slice(0, 120),
      color: input.color ?? "blue",
      description: input.description?.trim() || null,
      due_on: input.dueOn ?? null,
      status: input.status ?? "active",
      created_by_contact_id: createdByContactId,
      ...leadColumns(input.lead ?? (createdByContactId ? createdByContactId : "owner")),
    })
    .returning();
  return p!;
}

export async function updateProject(db: Db, projectId: string, input: Partial<ProjectInput>) {
  const cols: Partial<typeof projects.$inferInsert> = { ...leadColumns(input.lead) };
  if (input.name !== undefined) cols.name = input.name.trim().slice(0, 120);
  if (input.color !== undefined) cols.color = input.color;
  if (input.description !== undefined) cols.description = input.description?.trim() || null;
  if (input.dueOn !== undefined) cols.due_on = input.dueOn;
  if (input.status !== undefined) cols.status = input.status;
  const [p] = await db.update(projects).set(cols).where(eq(projects.id, projectId)).returning();
  return p ?? null;
}

// ─── Jalons ──────────────────────────────────────────────────────────

export async function addMilestone(db: Db, projectId: string, name: string, dueOn: string | null) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${projectMilestones.position})` })
    .from(projectMilestones)
    .where(eq(projectMilestones.project_id, projectId));
  const [m] = await db
    .insert(projectMilestones)
    .values({ project_id: projectId, name: name.trim().slice(0, 120), due_on: dueOn, position: (row?.max ?? 0) + 1 })
    .returning();
  return m!;
}

export async function updateMilestone(db: Db, milestoneId: string, input: { name?: string; dueOn?: string | null }) {
  const cols: Partial<typeof projectMilestones.$inferInsert> = {};
  if (input.name !== undefined) cols.name = input.name.trim().slice(0, 120);
  if (input.dueOn !== undefined) cols.due_on = input.dueOn;
  await db.update(projectMilestones).set(cols).where(eq(projectMilestones.id, milestoneId));
}

/** Supprimer un jalon ne supprime pas ses tâches : elles sont simplement détachées. */
export async function deleteMilestone(db: Db, milestoneId: string) {
  await db.delete(projectMilestones).where(eq(projectMilestones.id, milestoneId));
}

/** Rattache une tâche à un jalon de son propre projet (ou la détache avec null). */
export async function setTaskMilestone(db: Db, ticketId: string, milestoneId: string | null) {
  const [t] = await db.select({ project_id: tickets.project_id }).from(tickets).where(eq(tickets.id, ticketId));
  if (!t) return false;
  if (milestoneId) {
    const [m] = await db.select({ project_id: projectMilestones.project_id }).from(projectMilestones).where(eq(projectMilestones.id, milestoneId));
    if (!m || m.project_id !== t.project_id) return false;
  }
  await db.update(tickets).set({ milestone_id: milestoneId }).where(eq(tickets.id, ticketId));
  return true;
}

// ─── Points d'avancement ─────────────────────────────────────────────

export async function postProjectUpdate(db: Db, projectId: string, health: ProjectHealth, body: string) {
  const [u] = await db.insert(projectUpdates).values({ project_id: projectId, health, body: body.trim().slice(0, 10_000) }).returning();
  await db.update(projects).set({ updated_at: new Date() }).where(eq(projects.id, projectId));
  return u!;
}
