import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, items, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { getPortalProject, getPortalTicket, getPortalTickets } from "@/lib/auth/access";
import { getProjectDetail, listProjects } from "@/lib/projects/queries";
import { addTicketMessage, clientValidateTask, createTicket } from "./service";

let db: Db;
let x: string, boss: string, app: string, draft: string;
const itemOf = async (id: string | null) => (await db.select().from(items).where(eq(items.id, id!)))[0]!;

beforeEach(async () => {
  db = await createTestDb();
  const [c] = await db.insert(clients).values({ name: "Semaphors", slug: "semaphors" }).returning();
  x = c!.id;
  const [b] = await db.insert(clientContacts).values({ client_id: x, full_name: "Le Patron", email: "patron@semaphors.com", portal_access: true }).returning();
  boss = b!.id;
  const p = await db
    .insert(projects)
    .values([
      { client_id: x, name: "App planning", status: "active" },
      { client_id: x, name: "Idée secrète", status: "draft" },
    ])
    .returning();
  [app, draft] = [p[0]!.id, p[1]!.id];
});

const bossTask = (subject = "Ajouter un export CSV") =>
  createTicket(db, { kind: "task", clientId: x, projectId: app, contactId: boss, author: "client", subject, body: "Sur l'écran des plannings." });

describe("tâches de projet", () => {
  it("une tâche exige un projet", async () => {
    await expect(createTicket(db, { kind: "task", clientId: x, author: "admin", subject: "s", body: "b" })).rejects.toThrow();
  });

  it("tâche du patron → dans le flux, avec sa raison", async () => {
    const t = await bossTask();
    expect(t).toMatchObject({ kind: "task", status: "open" });
    const item = await itemOf(t.item_id);
    expect(item).toMatchObject({ kind: "ticket", status: "todo", project_id: app });
    expect(item.priority_reasons).toContain("Tâche confiée par le client");
  });

  it("tâche créée par l'admin : à faire par lui, raison « Tâche du projet »", async () => {
    const t = await createTicket(db, { kind: "task", clientId: x, projectId: app, author: "admin", subject: "Préparer la démo", body: "-" });
    expect(t.status).toBe("open");
    expect((await itemOf(t.item_id)).priority_reasons).toContain("Tâche du projet");
  });

  it("un commentaire de l'admin ne change pas le statut ; envoyer en validation, oui", async () => {
    const t = await bossTask();
    let r = await addTicketMessage(db, t.id, { author: "admin", body: "Je m'en occupe cette semaine." });
    expect(r.ticket.status).toBe("open");
    r = await addTicketMessage(db, t.id, { author: "admin", body: "C'est en ligne, à vous de tester.", status: "waiting_client" });
    expect(r.ticket.status).toBe("waiting_client");
    expect((await itemOf(t.item_id)).status).toBe("waiting");
  });

  it("le client valide → fait ; il commente au lieu de valider → retour à faire", async () => {
    const t = await bossTask();
    await addTicketMessage(db, t.id, { author: "admin", body: "À tester.", status: "waiting_client" });
    const done = await clientValidateTask(db, t.id, boss);
    expect(done?.status).toBe("resolved");
    expect((await itemOf(t.item_id)).status).toBe("done");
    expect((await getPortalTicket(db, [x], t.id))?.messages.at(-1)?.body).toBe("A validé la tâche.");

    const t2 = await bossTask("Autre");
    await addTicketMessage(db, t2.id, { author: "admin", body: "À tester.", status: "waiting_client" });
    const r = await addTicketMessage(db, t2.id, { author: "client", contactId: boss, body: "Le bouton n'apparaît pas." });
    expect(r.ticket.status).toBe("open");
  });

  it("on ne valide qu'une tâche soumise à validation", async () => {
    const t = await bossTask();
    expect(await clientValidateTask(db, t.id, boss)).toBeNull();
    const req = await createTicket(db, { clientId: x, contactId: boss, author: "client", subject: "Demande", body: "b" });
    expect(await clientValidateTask(db, req.id, boss)).toBeNull();
  });
});

describe("portail : projets", () => {
  it("le projet et ses tâches ; jamais un projet en brouillon ni ses tâches", async () => {
    const t = await bossTask();
    const hidden = await createTicket(db, { kind: "task", clientId: x, projectId: draft, author: "admin", subject: "Secret", body: "-" });

    const seen = await getPortalProject(db, [x], app);
    expect(seen?.tasks.map((k) => k.id)).toEqual([t.id]);
    expect(seen?.tasks[0]).toMatchObject({ author_name: "Le Patron", replies: 1 });

    expect(await getPortalProject(db, [x], draft)).toBeNull();
    expect(await getPortalTicket(db, [x], hidden.id)).toBeNull();
    expect((await getPortalTickets(db, [x])).map((k) => k.id)).toEqual([t.id]);
  });

  it("liste du portail : filtrage par sorte", async () => {
    const t = await bossTask();
    const req = await createTicket(db, { clientId: x, contactId: boss, author: "client", subject: "Demande", body: "b" });
    expect((await getPortalTickets(db, [x], "request")).map((k) => k.id)).toEqual([req.id]);
    expect((await getPortalTickets(db, [x], "task")).map((k) => k.id)).toEqual([t.id]);
  });

  it("autre client : rien", async () => {
    const [other] = await db.insert(clients).values({ name: "Autre", slug: "autre" }).returning();
    expect(await getPortalProject(db, [other!.id], app)).toBeNull();
  });
});

describe("admin : projets", () => {
  it("compteurs par projet et détail", async () => {
    const a = await bossTask("A");
    await bossTask("B");
    await addTicketMessage(db, a.id, { author: "admin", body: "ok", status: "waiting_client" });
    const list = await listProjects(db);
    const row = list.find((r) => r.project.id === app)!;
    expect(row).toMatchObject({ todo: 1, to_validate: 1, done: 0 });
    const detail = await getProjectDetail(db, app);
    expect(detail?.tasks).toHaveLength(2);
    expect(detail?.portalContacts.map((c) => c.name)).toEqual(["Le Patron"]);
  });
});
