import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, meetings, projects } from "@/lib/db/schema";
import type { Meeting, MeetingProposal } from "@/lib/db/types";
import { createTicket } from "@/lib/tickets/service";
import { parisParts } from "@/lib/time/paris";
import type { AnalysisContext } from "./analyze";

/** Plafond de la transcription (≈ 4 h de parole) : au-delà, on refuse d'ajouter. */
export const MAX_TRANSCRIPT = 400_000;

export async function createMeeting(db: Db, input: { clientId: string; projectId?: string | null; title?: string }) {
  const title = input.title?.trim() || `Réunion du ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}`;
  const [m] = await db
    .insert(meetings)
    .values({ client_id: input.clientId, project_id: input.projectId ?? null, title: title.slice(0, 120) })
    .returning();
  return m!;
}

export async function getMeeting(db: Db, id: string): Promise<Meeting | null> {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, id));
  return m ?? null;
}

/** Ajoute des lignes à la transcription d'une réunion en cours. Renvoie false si elle est close ou pleine. */
export async function appendTranscript(db: Db, id: string, chunk: string) {
  const text = chunk.replace(/\r/g, "").trim();
  if (!text) return true;
  const [row] = await db
    .update(meetings)
    .set({ transcript: sql`case when ${meetings.transcript} = '' then ${text} else ${meetings.transcript} || E'\\n' || ${text} end` })
    .where(and(eq(meetings.id, id), eq(meetings.status, "draft"), sql`length(${meetings.transcript}) + ${text.length} <= ${MAX_TRANSCRIPT}`))
    .returning({ id: meetings.id });
  return !!row;
}

/** Fin de l'enregistrement, avec la transcription éventuellement corrigée à la main. */
export async function closeMeeting(db: Db, id: string, transcript?: string) {
  const [m] = await db
    .update(meetings)
    .set({ ended_at: sql`coalesce(${meetings.ended_at}, now())`, ...(transcript !== undefined ? { transcript: transcript.slice(0, MAX_TRANSCRIPT) } : {}) })
    .where(eq(meetings.id, id))
    .returning();
  return m ?? null;
}

/** Ce que Claude doit savoir de l'espace pour attribuer les tâches. */
export async function analysisContext(db: Db, m: Meeting): Promise<AnalysisContext> {
  const [[ws], members, wsProjects] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, m.client_id)),
    db.select({ id: clientContacts.id, name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.client_id, m.client_id)).orderBy(asc(clientContacts.full_name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.client_id, m.client_id), ne(projects.status, "archived"))).orderBy(asc(projects.name)),
  ]);
  const p = parisParts(new Date());
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { workspace: ws?.name ?? "", members, projects: wsProjects, today };
}

export async function saveAnalysis(
  db: Db,
  id: string,
  result: { title: string; summary: string; decisions: string[]; proposals: MeetingProposal[] },
) {
  // Réanalyse : les propositions déjà transformées en tâches sont gardées, en tête.
  const kept = ((await getMeeting(db, id))?.proposals ?? []).filter((p) => p.ticket_id);
  const fresh = result.proposals.filter((p) => !kept.some((k) => k.title.toLowerCase() === p.title.toLowerCase()));
  await db
    .update(meetings)
    .set({ status: "ready", title: result.title || undefined, summary: result.summary, decisions: result.decisions, proposals: [...kept, ...fresh], error: null, analyzed_at: new Date() })
    .where(eq(meetings.id, id));
}

export async function saveAnalysisError(db: Db, id: string, message: string) {
  await db.update(meetings).set({ status: "failed", error: message.slice(0, 500) }).where(eq(meetings.id, id));
}

/** Modifications que tu apportes à une proposition avant de la retenir. */
export type ProposalEdit = Partial<Pick<MeetingProposal, "title" | "assignee" | "project_id" | "priority">>;

/**
 * Crée une tâche pour chaque proposition retenue (index), avec tes retouches.
 * Une proposition déjà transformée en tâche n'est pas recréée.
 */
export async function acceptProposals(db: Db, id: string, picks: { index: number; edit?: ProposalEdit }[]) {
  const m = await getMeeting(db, id);
  if (!m) return [];
  const proposals = [...m.proposals];
  const [members, wsProjects] = await Promise.all([
    db.select({ id: clientContacts.id }).from(clientContacts).where(eq(clientContacts.client_id, m.client_id)),
    db.select({ id: projects.id }).from(projects).where(eq(projects.client_id, m.client_id)),
  ]);
  const memberIds = new Set(members.map((x) => x.id));
  const projectIds = new Set(wsProjects.map((x) => x.id));
  const created: string[] = [];
  for (const { index, edit } of picks) {
    const p = proposals[index];
    if (!p || p.ticket_id) continue;
    const next = { ...p, ...edit };
    // Un assigné ou un projet hors de l'espace est ignoré.
    const assignee = next.assignee === "owner" || (next.assignee && memberIds.has(next.assignee)) ? next.assignee : null;
    const projectId = next.project_id && projectIds.has(next.project_id) ? next.project_id : null;
    const description = [next.description, `Issue de la réunion « ${m.title} ».`].filter(Boolean).join("\n\n");
    const ticket = await createTicket(db, {
      kind: "task",
      clientId: m.client_id,
      projectId,
      author: "admin",
      subject: next.title.trim().slice(0, 200) || p.title,
      body: description,
      task: { priority: next.priority, assignee, dueOn: next.due_on, labels: next.labels, description },
    });
    proposals[index] = { ...next, assignee, project_id: projectId, ticket_id: ticket.id };
    created.push(ticket.id);
  }
  await db.update(meetings).set({ proposals }).where(eq(meetings.id, id));
  return created;
}

export async function listMeetings(db: Db, clientId?: string) {
  return db
    .select({
      id: meetings.id,
      title: meetings.title,
      status: meetings.status,
      started_at: meetings.started_at,
      ended_at: meetings.ended_at,
      client_id: meetings.client_id,
      client_name: clients.name,
      client_color: clients.color,
      proposals: meetings.proposals,
      words: sql<number>`coalesce(array_length(regexp_split_to_array(nullif(trim(${meetings.transcript}), ''), '\\s+'), 1), 0)`,
    })
    .from(meetings)
    .innerJoin(clients, eq(clients.id, meetings.client_id))
    .where(clientId ? eq(meetings.client_id, clientId) : undefined)
    .orderBy(desc(meetings.started_at))
    .limit(100);
}
