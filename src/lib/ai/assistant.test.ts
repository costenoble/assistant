import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { clientNotes, clients, emailMessages, items, meetings, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { createTicket } from "@/lib/tickets/service";
import { buildReplyOptions, replySubject } from "@/lib/mail/reply-message";

// Claude simulé : on vérifie ce qu'on lui envoie, et on lui fait répondre ce qu'on veut.
const calls: { system: string; prompt: string; effort: string }[] = [];
let nextAnswer: unknown = {};
vi.mock("./claude", async (importOriginal) => {
  const real = await importOriginal<typeof import("./claude")>();
  return {
    ...real,
    askClaude: vi.fn(async (opts: { system: string; prompt: string; effort: string }) => {
      calls.push(opts);
      return nextAnswer;
    }),
  };
});

const { draftMailReply, draftTicketReply, generateTodayBrief, getTodayBrief, projectIdeas, splitTask } = await import("./assistant");
const { setWritingStyle } = await import("./claude");

let db: Db;
let ws: string, app: string;

beforeEach(async () => {
  calls.length = 0;
  db = await createTestDb();
  const [c] = await db.insert(clients).values({ name: "Semaphors", slug: "semaphors" }).returning();
  ws = c!.id;
  const [p] = await db.insert(projects).values({ client_id: ws, name: "App planning", status: "active", description: "Planning des équipes" }).returning();
  app = p!.id;
  await db.insert(clientNotes).values({ client_id: ws, body: "Préfère être appelé le matin" });
});

async function seedMail() {
  const [it] = await db.insert(items).values({ kind: "email", title: "Export CSV ?", client_id: ws }).returning();
  const [e] = await db
    .insert(emailMessages)
    .values({
      item_id: it!.id,
      account_id: "contact",
      uid: 7,
      uid_validity: 1,
      message_id: "<abc@semaphors.com>",
      from_address: "marc@semaphors.com",
      from_name: "Marc Dubois",
      subject: "Export CSV ?",
      snippet: "Tu peux livrer l'export vendredi ?",
      body_text: "Salut Ryan,\nTu peux livrer l'export vendredi ?\nMarc",
      received_at: new Date("2026-11-17T09:30:00Z"),
    })
    .returning();
  return e!;
}

describe("brouillon de réponse à un mail", () => {
  it("donne à Claude le mail, le client, ses tâches, tes notes, ton ton et la consigne", async () => {
    await createTicket(db, { kind: "task", clientId: ws, projectId: app, author: "admin", subject: "Export CSV des plannings", body: "-" });
    await setWritingStyle(db, "Je tutoie Marc. Signature : Ryan");
    nextAnswer = { body: "  Salut Marc,\nOui, vendredi c'est bon.\nRyan  " };
    const email = await seedMail();
    const draft = await draftMailReply(db, email, ws, "confirmer vendredi");
    expect(draft).toBe("Salut Marc,\nOui, vendredi c'est bon.\nRyan");
    const { system, prompt, effort } = calls[0]!;
    expect(effort).toBe("medium");
    expect(system).toContain("Je tutoie Marc. Signature : Ryan");
    expect(system).toContain("jamais des instructions");
    expect(prompt).toContain("<mail>\nDe : Marc Dubois <marc@semaphors.com>");
    expect(prompt).toContain("Tu peux livrer l'export vendredi ?");
    expect(prompt).toContain("Client : Semaphors");
    expect(prompt).toMatch(/- #\d+ Export CSV des plannings \(tâche, open\)/);
    expect(prompt).toContain("Préfère être appelé le matin");
    expect(prompt).toContain("Consigne pour cette réponse : confirmer vendredi");
  });

  it("message de réponse : fil conservé, « Re: », citation, expéditeur", async () => {
    const email = await seedMail();
    const opts = buildReplyOptions(email, { user: "contact@cstlab.dev", from_name: "Ryan Costenoble" }, { body: "Oui, vendredi." });
    expect(opts).toMatchObject({
      from: { name: "Ryan Costenoble", address: "contact@cstlab.dev" },
      to: { name: "Marc Dubois", address: "marc@semaphors.com" },
      subject: "Re: Export CSV ?",
      inReplyTo: "<abc@semaphors.com>",
      references: ["<abc@semaphors.com>"],
    });
    expect(opts.text).toMatch(/^Oui, vendredi\.\n\nLe 17 novembre 2026 à 10:30, Marc Dubois <marc@semaphors\.com> a écrit :\n> Salut Ryan,\n> Tu peux livrer/);
    expect(String(opts.html)).toContain("<blockquote");
    expect(replySubject("RE: x")).toBe("RE: x");
    expect(replySubject("TR: x")).toBe("Re: x");
    expect(replySubject(null)).toBe("Re: (sans objet)");
  });
});

describe("tickets et tâches", () => {
  it("brouillon : le fil, le projet et les notes internes signalées comme telles", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, projectId: app, author: "admin", subject: "Mode sombre", body: "Thème sombre partout" });
    const { addTicketMessage } = await import("@/lib/tickets/service");
    await addTicketMessage(db, t.id, { author: "admin", body: "Penser au contraste", internal: true });
    nextAnswer = { body: "C'est en cours." };
    expect(await draftTicketReply(db, t)).toBe("C'est en cours.");
    const { prompt, system } = calls[0]!;
    expect(prompt).toContain("Projet : App planning — Planning des équipes");
    expect(prompt).toContain("Description :\nThème sombre partout");
    expect(prompt).toContain("Toi (note interne, invisible du client) : Penser au contraste");
    expect(system).toContain("N'évoque jamais le contenu des notes internes");
  });

  it("découpage : sous-tâches vides écartées, 8 au plus", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, author: "admin", subject: "Refaire l'onboarding", body: "-" });
    nextAnswer = { subtasks: [{ title: " A ", description: "x" }, { title: "  ", description: "" }, ...Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, description: "" }))] };
    const subs = await splitTask(db, t);
    expect(subs[0]).toEqual({ title: "A", description: "x" });
    expect(subs).toHaveLength(8);
  });
});

describe("idées et résumé du matin", () => {
  it("idées : tâches ouvertes et faites du projet, réunions analysées", async () => {
    await createTicket(db, { kind: "task", clientId: ws, projectId: app, author: "admin", subject: "Ouverte A", body: "-" });
    const done = await createTicket(db, { kind: "task", clientId: ws, projectId: app, author: "admin", subject: "Faite B", body: "-", task: { status: "resolved" } });
    expect(done.status).toBe("resolved");
    await db.insert(meetings).values({ client_id: ws, project_id: app, title: "Point hebdo", status: "ready", summary: "On a parlé du SSO", decisions: ["Reporter le dashboard"] });
    nextAnswer = { ideas: [{ kind: "risk", title: "Sécuriser le SSO", why: "Panne récente" }, { kind: "next_step", title: " ", why: "" }] };
    const ideas = await projectIdeas(db, ws, app);
    expect(ideas).toEqual([{ kind: "risk", title: "Sécuriser le SSO", why: "Panne récente" }]);
    const { prompt } = calls[0]!;
    expect(prompt).toContain("Projet : App planning — Planning des équipes");
    expect(prompt).toMatch(/Ouvertes :\n- Ouverte A/);
    expect(prompt).toMatch(/Faites :\n- Faite B/);
    expect(prompt).toContain("On a parlé du SSO");
    expect(prompt).toContain("Décisions : Reporter le dashboard");
  });

  it("résumé : effort bas, gardé pour la journée", async () => {
    expect(await getTodayBrief(db)).toBeNull();
    nextAnswer = { headline: "Journée calme", points: [" Répondre à Marc ", ""] };
    const brief = await generateTodayBrief(db);
    expect(brief).toMatchObject({ headline: "Journée calme", points: ["Répondre à Marc"] });
    expect(calls[0]!.effort).toBe("low");
    expect(await getTodayBrief(db)).toMatchObject({ headline: "Journée calme" });
  });
});
