import "server-only";
import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, emailMessages, items, meetings, projects, tickets } from "@/lib/db/schema";

/**
 * Recherche globale (Cmd + K) : tâches et suivis, mails, tickets et tâches
 * d'espace, clients, contacts, projets, réunions. Recherche par contenu
 * (insensible à la casse) ; « #12 » ouvre directement le ticket n°12.
 */

export type SearchGroup = "Tâches" | "Mails" | "Tickets et tâches d'espace" | "Clients" | "Contacts" | "Projets" | "Réunions";
export interface SearchResult {
  group: SearchGroup;
  title: string;
  subtitle?: string;
  href: string;
}

const PER_GROUP = 5;
/** Échappe % et _ pour qu'ils soient cherchés tels quels. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchAll(db: Db, raw: string): Promise<SearchResult[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2 && !/^#\d+$/.test(q)) return [];
  const p = like(q);
  const number = q.match(/^#?(\d{1,7})$/)?.[1];
  const anyOf = (...conds: SQL[]) => or(...conds)!;

  const [taskRows, mailRows, ticketRows, clientRows, contactRows, projectRows, meetingRows] = await Promise.all([
    db
      .select({ id: items.id, title: items.title, status: items.status, kind: items.kind })
      .from(items)
      .where(and(inArray(items.kind, ["task", "followup", "event"]), ne(items.status, "archived"), anyOf(ilike(items.title, p), ilike(items.body, p))))
      .orderBy(desc(items.updated_at))
      .limit(PER_GROUP),
    db
      .select({ id: items.id, subject: emailMessages.subject, from: sql<string>`coalesce(${emailMessages.from_name}, ${emailMessages.from_address})`, received_at: emailMessages.received_at })
      .from(emailMessages)
      .innerJoin(items, eq(items.id, emailMessages.item_id))
      .where(anyOf(ilike(emailMessages.subject, p), ilike(emailMessages.from_name, p), ilike(emailMessages.from_address, p), ilike(emailMessages.snippet, p)))
      .orderBy(desc(emailMessages.received_at))
      .limit(PER_GROUP),
    db
      .select({ id: tickets.id, number: tickets.number, subject: tickets.subject, kind: tickets.kind, status: tickets.status, client: clients.name })
      .from(tickets)
      .innerJoin(clients, eq(clients.id, tickets.client_id))
      .where(anyOf(ilike(tickets.subject, p), ilike(tickets.description, p), ...(number ? [eq(tickets.number, Number(number))] : [])))
      .orderBy(number ? sql`(${tickets.number} = ${Number(number ?? 0)}) desc` : desc(tickets.last_message_at), desc(tickets.last_message_at))
      .limit(PER_GROUP),
    db.select({ id: clients.id, name: clients.name, kind: clients.kind }).from(clients).where(ilike(clients.name, p)).orderBy(clients.name).limit(PER_GROUP),
    db
      .select({ id: clientContacts.id, name: clientContacts.full_name, email: clientContacts.email, client_id: clients.id, client: clients.name })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.client_id))
      .where(anyOf(ilike(clientContacts.full_name, p), ilike(clientContacts.email, p)))
      .orderBy(clientContacts.full_name)
      .limit(PER_GROUP),
    db
      .select({ id: projects.id, name: projects.name, client_id: clients.id, client: clients.name })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.client_id))
      .where(and(ne(projects.status, "archived"), anyOf(ilike(projects.name, p), ilike(projects.description, p))))
      .orderBy(projects.name)
      .limit(PER_GROUP),
    db
      .select({ id: meetings.id, title: meetings.title, started_at: meetings.started_at, client: clients.name })
      .from(meetings)
      .innerJoin(clients, eq(clients.id, meetings.client_id))
      .where(anyOf(ilike(meetings.title, p), ilike(meetings.summary, p), ilike(meetings.transcript, p)))
      .orderBy(desc(meetings.started_at))
      .limit(PER_GROUP),
  ]);

  const day = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  return [
    ...ticketRows.map((t): SearchResult => ({ group: "Tickets et tâches d'espace", title: `#${t.number} ${t.subject}`, subtitle: `${t.client} · ${t.kind === "task" ? "tâche" : "demande"}`, href: `/tickets/${t.id}` })),
    ...taskRows.map((t): SearchResult => ({ group: "Tâches", title: t.title, subtitle: t.kind === "event" ? "rendez-vous" : t.status === "done" ? "faite" : undefined, href: "/taches" })),
    ...mailRows.map((m): SearchResult => ({ group: "Mails", title: m.subject || "(sans objet)", subtitle: `${m.from ?? ""} · ${day(m.received_at)}`, href: `/inbox/${m.id}` })),
    ...clientRows.map((c): SearchResult => ({ group: "Clients", title: c.name, subtitle: c.kind === "internal" ? "espace interne" : "client", href: c.kind === "internal" ? `/espaces/${c.id}` : `/clients/${c.id}` })),
    ...contactRows.map((c): SearchResult => ({ group: "Contacts", title: c.name, subtitle: [c.email, c.client].filter(Boolean).join(" · "), href: `/clients/${c.client_id}` })),
    ...projectRows.map((p): SearchResult => ({ group: "Projets", title: p.name, subtitle: p.client, href: `/espaces/${p.client_id}?projet=${p.id}` })),
    ...meetingRows.map((m): SearchResult => ({ group: "Réunions", title: m.title, subtitle: `${m.client} · ${day(m.started_at)}`, href: `/reunions/${m.id}` })),
  ];
}
