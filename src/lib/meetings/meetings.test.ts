import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects, tickets } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { buildUserPrompt, mapAnalysis, type Analysis, type AnalysisContext } from "./analyze";
import { acceptProposals, analysisContext, appendTranscript, closeMeeting, createMeeting, getMeeting, MAX_TRANSCRIPT, saveAnalysis } from "./service";

let db: Db;
let ws: string, other: string, marc: string, julie: string, stranger: string, planning: string;

beforeEach(async () => {
  db = await createTestDb();
  const [a, b] = await db.insert(clients).values([{ name: "Semaphors", slug: "semaphors" }, { name: "Autre", slug: "autre" }]).returning();
  [ws, other] = [a!.id, b!.id];
  const c = await db
    .insert(clientContacts)
    .values([
      { client_id: ws, full_name: "Marc Dubois" },
      { client_id: ws, full_name: "Julie Martin" },
      { client_id: other, full_name: "Intrus" },
    ])
    .returning();
  [marc, julie, stranger] = [c[0]!.id, c[1]!.id, c[2]!.id];
  const [p] = await db.insert(projects).values({ client_id: ws, name: "App planning", status: "active" }).returning();
  planning = p!.id;
});

const ctx = (): AnalysisContext => ({
  workspace: "Semaphors",
  today: "2026-11-17",
  members: [{ id: marc, name: "Marc Dubois" }, { id: julie, name: "Julie Martin" }],
  projects: [{ id: planning, name: "App planning" }],
});

const task = (over: Partial<Analysis["tasks"][number]>): Analysis["tasks"][number] => ({
  title: "Faire",
  description: "",
  priority: "none",
  assignee: "",
  project: "",
  due_on: "",
  labels: [],
  ...over,
});

describe("rapprochement de la réponse de Claude", () => {
  it("assignés : « moi », nom exact, prénom seul, inconnu", () => {
    const r = mapAnalysis(
      {
        title: " Point hebdo ",
        summary: "s",
        decisions: ["d", " "],
        tasks: [task({ assignee: "moi" }), task({ assignee: "Julie Martin" }), task({ assignee: "marc" }), task({ assignee: "Paul" }), task({ title: "  " })],
      },
      ctx(),
    );
    expect(r.title).toBe("Point hebdo");
    expect(r.decisions).toEqual(["d"]);
    expect(r.proposals.map((p) => p.assignee)).toEqual(["owner", julie, marc, null]);
  });

  it("projet, échéance et étiquettes nettoyés", () => {
    const [p] = mapAnalysis(
      { title: "t", summary: "s", decisions: [], tasks: [task({ project: "app planning", due_on: "2026-11-20", labels: ["UX", "ux", " Bug ", "a", "b"] })] },
      ctx(),
    ).proposals;
    expect(p).toMatchObject({ project_id: planning, due_on: "2026-11-20", labels: ["ux", "bug", "a"], ticket_id: null });
    const [q] = mapAnalysis({ title: "t", summary: "s", decisions: [], tasks: [task({ project: "Inconnu", due_on: "vendredi" })] }, ctx()).proposals;
    expect(q).toMatchObject({ project_id: null, due_on: null });
  });

  it("le prompt contient l'espace, la date, les membres, les projets et la transcription", () => {
    const p = buildUserPrompt("[00:12] on livre vendredi", ctx());
    for (const s of ["Semaphors", "2026-11-17", "- Julie Martin", "- App planning", "<transcription>\n[00:12] on livre vendredi\n</transcription>"]) expect(p).toContain(s);
  });
});

describe("cycle d'une réunion", () => {
  it("transcription ajoutée par morceaux, dans l'ordre", async () => {
    const m = await createMeeting(db, { clientId: ws });
    expect(m.title).toMatch(/^Réunion du /);
    await appendTranscript(db, m.id, "[00:01] bonjour");
    await appendTranscript(db, m.id, "  ");
    await appendTranscript(db, m.id, "[00:05] on commence");
    expect((await getMeeting(db, m.id))?.transcript).toBe("[00:01] bonjour\n[00:05] on commence");
  });

  it("plus d'ajout une fois analysée, ni au-delà du plafond", async () => {
    const m = await createMeeting(db, { clientId: ws });
    expect(await appendTranscript(db, m.id, "x".repeat(MAX_TRANSCRIPT + 1))).toBe(false);
    await saveAnalysis(db, m.id, { title: "T", summary: "S", decisions: [], proposals: [] });
    expect(await appendTranscript(db, m.id, "trop tard")).toBe(false);
    expect((await getMeeting(db, m.id))?.status).toBe("ready");
  });

  it("clôture avec transcription corrigée à la main", async () => {
    const m = await createMeeting(db, { clientId: ws });
    await appendTranscript(db, m.id, "[00:01] la pli");
    const closed = await closeMeeting(db, m.id, "[00:01] l'appli");
    expect(closed).toMatchObject({ transcript: "[00:01] l'appli" });
    expect(closed?.ended_at).toBeInstanceOf(Date);
  });

  it("contexte d'analyse : seulement les membres et projets de l'espace", async () => {
    const m = await createMeeting(db, { clientId: ws });
    const c = await analysisContext(db, m);
    expect(c.workspace).toBe("Semaphors");
    expect(c.members.map((x) => x.name)).toEqual(["Julie Martin", "Marc Dubois"]);
    expect(c.projects.map((x) => x.name)).toEqual(["App planning"]);
    expect(c.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("propositions retenues → tâches dans l'espace, une seule fois, assignés d'ailleurs ignorés", async () => {
    const m = await createMeeting(db, { clientId: ws, title: "Point hebdo" });
    const base = { description: "Contexte", priority: "high" as const, project_id: planning, due_on: "2026-11-20", labels: ["ux"], ticket_id: null };
    await saveAnalysis(db, m.id, {
      title: "Point hebdo",
      summary: "S",
      decisions: [],
      proposals: [
        { ...base, title: "Export CSV", assignee: julie },
        { ...base, title: "Corriger SSO", assignee: "owner" },
        { ...base, title: "Écartée", assignee: null },
      ],
    });
    const created = await acceptProposals(db, m.id, [{ index: 0 }, { index: 1, edit: { title: "Corriger la connexion SSO", assignee: stranger } }]);
    expect(created).toHaveLength(2);
    const rows = await db.select().from(tickets).where(eq(tickets.client_id, ws));
    const csv = rows.find((t) => t.subject === "Export CSV")!;
    expect(csv).toMatchObject({ kind: "task", priority: "high", assignee_contact_id: julie, project_id: planning, due_on: "2026-11-20", labels: ["ux"] });
    expect(csv.description).toContain("Issue de la réunion « Point hebdo ».");
    const sso = rows.find((t) => t.subject === "Corriger la connexion SSO")!;
    expect(sso).toMatchObject({ assignee_contact_id: null, assigned_to_owner: false }); // l'intrus d'un autre espace est refusé
    // Déjà créées : pas de doublon.
    expect(await acceptProposals(db, m.id, [{ index: 0 }])).toEqual([]);
    const after = await getMeeting(db, m.id);
    expect(after?.proposals.map((p) => p.ticket_id !== null)).toEqual([true, true, false]);
    // Réanalyse : les tâches créées restent, les doublons de titre ne reviennent pas.
    await saveAnalysis(db, m.id, { title: "Point hebdo", summary: "S2", decisions: [], proposals: [{ ...base, title: "export csv", assignee: null }, { ...base, title: "Nouvelle", assignee: null }] });
    expect((await getMeeting(db, m.id))?.proposals.map((p) => p.title)).toEqual(["Export CSV", "Corriger la connexion SSO", "Nouvelle"]);
  });
});
