import "server-only";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { clientContacts, clientNotes, clients, meetings, projects, syncState, ticketMessages, tickets } from "@/lib/db/schema";
import type { EmailMessage, Ticket } from "@/lib/db/types";
import { getTodayData } from "@/lib/items/queries";
import { formatDay, formatTime, parisParts } from "@/lib/time/paris";
import { askClaude, getWritingStyle, styleBlock, UNTRUSTED_NOTE } from "./claude";

/**
 * L'assistant au quotidien : brouillons de réponse (mails, tickets), découpage
 * d'une tâche, idées pour un projet, résumé du matin. Claude ne fait jamais
 * rien tout seul : tout passe par ta relecture.
 */

/** Long texte coupé proprement (début gardé : c'est là qu'est le message, la citation vient après). */
const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}\n[…]` : t;
};

const today = () => {
  const p = parisParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

/** Ce qu'on sait d'un client : tâches et demandes en cours, notes internes récentes. */
async function clientContext(db: Db, clientId: string | null) {
  if (!clientId) return "";
  const [[c], open, notes] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)),
    db
      .select({ number: tickets.number, subject: tickets.subject, status: tickets.status, kind: tickets.kind })
      .from(tickets)
      .where(and(eq(tickets.client_id, clientId), notInArray(tickets.status, ["resolved", "canceled"])))
      .orderBy(desc(tickets.last_message_at))
      .limit(15),
    db.select({ body: clientNotes.body }).from(clientNotes).where(eq(clientNotes.client_id, clientId)).orderBy(desc(clientNotes.created_at)).limit(5),
  ]);
  if (!c) return "";
  const lines = [`Client : ${c.name}`];
  if (open.length) lines.push("<taches>", ...open.map((t) => `- #${t.number} ${t.subject} (${t.kind === "task" ? "tâche" : "demande"}, ${t.status})`), "</taches>");
  if (notes.length) lines.push("Tes notes internes sur ce client :", ...notes.map((n) => `- ${clip(n.body, 300)}`));
  return lines.join("\n");
}

// ─── Mails ───────────────────────────────────────────────────────────

const ReplySchema = z.object({
  body: z.string().describe("Le texte de la réponse, prêt à envoyer, avec formule d'appel et signature"),
});

export async function draftMailReply(db: Db, email: EmailMessage, clientId: string | null, instruction?: string) {
  const [style, client] = await Promise.all([getWritingStyle(db), clientContext(db, clientId)]);
  const system = `Tu rédiges des brouillons de réponse aux mails d'un développeur freelance, à sa place et en son nom.
Réponds en français (ou dans la langue du mail), au ton juste, sans promettre de délai ni de prix qui ne figure pas dans le contexte : si une information manque, propose une formulation neutre ou pose la question.
Pas d'objet, pas de citation du mail d'origine : seulement le corps de la réponse.
${styleBlock(style)}
${UNTRUSTED_NOTE}`;
  const prompt = `Date du jour : ${today()}
${client}

<mail>
De : ${email.from_name ?? ""} <${email.from_address ?? ""}>
Objet : ${email.subject ?? ""}
Reçu le : ${formatDay(email.received_at)} à ${formatTime(email.received_at)}

${clip(email.body_text ?? email.snippet, 15000)}
</mail>
${instruction?.trim() ? `\nConsigne pour cette réponse : ${instruction.trim()}` : ""}`;
  return (await askClaude({ schema: ReplySchema, system, prompt, effort: "medium" })).body.trim();
}

// ─── Tickets et tâches ───────────────────────────────────────────────

async function ticketContext(db: Db, ticket: Ticket) {
  const [thread, [project]] = await Promise.all([
    db
      .select({ author: ticketMessages.author, body: ticketMessages.body, internal: ticketMessages.internal, created_at: ticketMessages.created_at, name: clientContacts.full_name })
      .from(ticketMessages)
      .leftJoin(clientContacts, eq(clientContacts.id, ticketMessages.contact_id))
      .where(eq(ticketMessages.ticket_id, ticket.id))
      .orderBy(asc(ticketMessages.created_at)),
    ticket.project_id ? db.select({ name: projects.name, description: projects.description }).from(projects).where(eq(projects.id, ticket.project_id)) : Promise.resolve([]),
  ]);
  const fil = thread
    .slice(-30)
    .map((m) => `[${formatDay(m.created_at)}] ${m.author === "admin" ? (m.internal ? "Toi (note interne, invisible du client)" : "Toi") : (m.name ?? "Client")} : ${clip(m.body, 2000)}`)
    .join("\n");
  return `${ticket.kind === "task" ? "Tâche" : "Demande"} #${ticket.number} : ${ticket.subject} (statut : ${ticket.status})
${project ? `Projet : ${project.name}${project.description ? ` — ${project.description}` : ""}` : ""}
${ticket.description ? `Description :\n${clip(ticket.description, 6000)}` : ""}

<fil>
${fil || "(aucun échange)"}
</fil>`;
}

export async function draftTicketReply(db: Db, ticket: Ticket, instruction?: string) {
  const [style, client, context] = await Promise.all([getWritingStyle(db), clientContext(db, ticket.client_id), ticketContext(db, ticket)]);
  const system = `Tu rédiges, au nom d'un développeur freelance, sa prochaine réponse au client dans le fil d'une demande ou d'une tâche.
Réponse courte et concrète : ce qui a été fait, ce qui reste, la question précise s'il en faut une. Ne promets ni délai ni prix absent du contexte. N'évoque jamais le contenu des notes internes.
${styleBlock(style)}
${UNTRUSTED_NOTE}`;
  const prompt = `Date du jour : ${today()}\n${client}\n\n${context}${instruction?.trim() ? `\n\nConsigne pour cette réponse : ${instruction.trim()}` : ""}`;
  return (await askClaude({ schema: ReplySchema, system, prompt, effort: "medium" })).body.trim();
}

export const SubtasksSchema = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string().describe("Action concrète à l'infinitif, moins de 80 caractères"),
        description: z.string().describe("Critère de fin ou précision utile ; chaîne vide si inutile"),
      }),
    )
    .describe("2 à 8 sous-tâches, dans l'ordre où les faire"),
});

export async function splitTask(db: Db, ticket: Ticket) {
  const context = await ticketContext(db, ticket);
  const system = `Tu aides un développeur freelance à découper une demande floue en sous-tâches concrètes, chacune faisable en moins d'une journée et vérifiable.
N'invente pas de fonctionnalité absente de la demande ; si un point est ambigu, fais-en une sous-tâche « Clarifier … avec le client ».
${UNTRUSTED_NOTE}`;
  const { subtasks } = await askClaude({ schema: SubtasksSchema, system, prompt: context, effort: "medium" });
  return subtasks.filter((s) => s.title.trim()).slice(0, 8).map((s) => ({ title: s.title.trim().slice(0, 200), description: s.description.trim() }));
}

// ─── Projets ─────────────────────────────────────────────────────────

export const IDEA_KINDS = ["next_step", "improvement", "risk"] as const;
export const IdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        kind: z.enum(IDEA_KINDS),
        title: z.string().describe("Formulée comme une tâche, moins de 80 caractères"),
        why: z.string().describe("Pourquoi, en une ou deux phrases, en s'appuyant sur le contexte"),
      }),
    )
    .describe("4 à 8 idées, les plus utiles d'abord"),
});
export type Idea = z.infer<typeof IdeasSchema>["ideas"][number];

export async function projectIdeas(db: Db, workspaceId: string, projectId: string | null) {
  const projectFilter = projectId ? eq(tickets.project_id, projectId) : undefined;
  const [[ws], wsProjects, taskRows, meetingRows] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, workspaceId)),
    db.select({ id: projects.id, name: projects.name, description: projects.description, status: projects.status }).from(projects).where(eq(projects.client_id, workspaceId)),
    db
      .select({ subject: tickets.subject, status: tickets.status, priority: tickets.priority, project_id: tickets.project_id })
      .from(tickets)
      .where(and(eq(tickets.client_id, workspaceId), eq(tickets.kind, "task"), projectFilter))
      .orderBy(desc(tickets.last_message_at))
      .limit(80),
    db
      .select({ title: meetings.title, summary: meetings.summary, decisions: meetings.decisions, started_at: meetings.started_at })
      .from(meetings)
      .where(and(eq(meetings.client_id, workspaceId), eq(meetings.status, "ready"), projectId ? eq(meetings.project_id, projectId) : undefined))
      .orderBy(desc(meetings.started_at))
      .limit(5),
  ]);
  const project = projectId ? wsProjects.find((p) => p.id === projectId) : null;
  const done = taskRows.filter((t) => t.status === "resolved");
  const open = taskRows.filter((t) => !["resolved", "canceled"].includes(t.status));
  const system = `Tu es le binôme produit d'un développeur freelance. À partir de l'état d'un projet, propose des idées utiles : prochaines étapes logiques, améliorations qui feraient plaisir au client, risques à traiter.
Appuie chaque idée sur le contexte (tâches, réunions) ; pas d'idée générique applicable à n'importe quel projet. Ne reprends pas une tâche déjà ouverte.
${UNTRUSTED_NOTE}`;
  const prompt = `Espace : ${ws?.name ?? ""}
${project ? `Projet : ${project.name}${project.description ? ` — ${project.description}` : ""}` : `Projets : ${wsProjects.map((p) => p.name).join(", ") || "(aucun)"}`}

<taches>
Ouvertes :
${open.map((t) => `- ${t.subject} (${t.status}, priorité ${t.priority})`).join("\n") || "(aucune)"}
Faites :
${done.slice(0, 40).map((t) => `- ${t.subject}`).join("\n") || "(aucune)"}
</taches>

<reunions>
${meetingRows.map((m) => `${formatDay(m.started_at)} — ${m.title}\n${clip(m.summary, 1500)}\nDécisions : ${m.decisions.join(" ; ") || "aucune"}`).join("\n\n") || "(aucune réunion analysée)"}
</reunions>`;
  const { ideas } = await askClaude({ schema: IdeasSchema, system, prompt, effort: "medium" });
  return ideas.filter((i) => i.title.trim()).slice(0, 8);
}

// ─── Résumé du matin ─────────────────────────────────────────────────

export const BriefSchema = z.object({
  headline: z.string().describe("Une phrase qui résume la journée"),
  points: z.array(z.string()).describe("3 à 6 points concrets, du plus urgent au moins urgent"),
});
export type Brief = z.infer<typeof BriefSchema> & { generated_at: string };

const briefKey = (day: string) => `ai:brief:${day}`;

/** Résumé déjà généré aujourd'hui (gardé pour la journée : pas de nouvel appel à chaque visite). */
export async function getTodayBrief(db: Db): Promise<Brief | null> {
  const [row] = await db.select({ value: syncState.value }).from(syncState).where(eq(syncState.key, briefKey(today())));
  return (row?.value as Brief | undefined) ?? null;
}

export async function generateTodayBrief(db: Db): Promise<Brief> {
  const now = new Date();
  const [data, untriaged] = await Promise.all([
    getTodayData(db, now),
    db.select({ title: meetings.title, proposals: meetings.proposals }).from(meetings).where(inArray(meetings.status, ["ready"])).orderBy(desc(meetings.started_at)).limit(10),
  ]);
  const toSort = untriaged.filter((m) => m.proposals.some((p) => !p.ticket_id));
  const system = `Tu prépares le point du matin d'un développeur freelance : en 30 secondes de lecture, ce qui presse, ce qui attend une réponse, les rendez-vous du jour.
Sois concret (noms, sujets, heures), pas de remplissage, pas de conseils de productivité. Tutoie-le.
${UNTRUSTED_NOTE}`;
  const prompt = `Nous sommes le ${formatDay(now)}, il est ${formatTime(now)}.
En retard : ${data.overdueCount}. En attente d'un tiers : ${data.waitingCount}.

À faire maintenant (par priorité) :
${data.focus.map((i) => `- ${i.title}${i.due_at ? ` (échéance ${formatDay(i.due_at)} ${formatTime(i.due_at)})` : ""}${i.priority_reasons.length ? ` [${i.priority_reasons.slice(0, 2).join(", ")}]` : ""}`).join("\n") || "(rien)"}

<mail>
Mails qui attendent une réponse :
${data.emails.map((i) => `- ${i.email_messages?.from_name ?? i.email_messages?.from_address ?? "?"} : ${i.title} — ${clip(i.email_messages?.snippet, 160)}`).join("\n") || "(aucun)"}
</mail>

Rendez-vous aujourd'hui :
${data.events.map((e) => `- ${e.starts_at ? formatTime(e.starts_at) : "?"} ${e.title}`).join("\n") || "(aucun)"}
Demain :
${data.tomorrowEvents.map((e) => `- ${e.starts_at ? formatTime(e.starts_at) : "?"} ${e.title}`).join("\n") || "(rien)"}
${toSort.length ? `\nRéunions dont les tâches proposées n'ont pas été triées : ${toSort.map((m) => m.title).join(", ")}` : ""}`;
  const result = await askClaude({ schema: BriefSchema, system, prompt, effort: "low", maxTokens: 4000 });
  const brief: Brief = { headline: result.headline.trim(), points: result.points.map((p) => p.trim()).filter(Boolean).slice(0, 6), generated_at: now.toISOString() };
  const key = briefKey(today());
  await db.insert(syncState).values({ key, value: brief }).onConflictDoUpdate({ target: syncState.key, set: { value: brief, updated_at: now } });
  return brief;
}
