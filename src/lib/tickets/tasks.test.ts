import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, items, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { getPortalProject, getPortalTicket, getPortalTickets } from "@/lib/auth/access";
import { getProjectDetail, listProjects } from "@/lib/projects/queries";
import { addTicketMessage, clientValidateTask, createTicket, moveTask, updateTask } from "./service";

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
  it("une tâche peut vivre dans l'espace sans projet", async () => {
    const t = await createTicket(db, { kind: "task", clientId: x, author: "admin", subject: "Idée", body: "b" });
    expect(t).toMatchObject({ kind: "task", project_id: null, assigned_to_owner: true });
  });

  it("tâche du patron → dans le flux, avec sa raison", async () => {
    const t = await bossTask();
    expect(t).toMatchObject({ kind: "task", status: "open", description: "Sur l'écran des plannings." });
    expect((await getPortalTicket(db, [x], t.id))?.messages).toEqual([]); // le texte de départ est la description
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
    expect(seen?.tasks[0]).toMatchObject({ author_name: "Le Patron", replies: 0 });

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

describe("propriétés façon Linear", () => {
  it("assignée au patron → sort de ton « À faire », revient quand elle t'est réassignée", async () => {
    const t = await bossTask();
    await updateTask(db, t.id, { assignee: boss });
    expect((await itemOf(t.item_id)).status).toBe("waiting");
    await updateTask(db, t.id, { assignee: "owner" });
    expect((await itemOf(t.item_id)).status).toBe("todo");
  });

  it("backlog et annulé ne sont pas dans « À faire maintenant »", async () => {
    const t = await bossTask();
    await updateTask(db, t.id, { status: "backlog" });
    expect((await itemOf(t.item_id)).status).toBe("waiting");
    await updateTask(db, t.id, { status: "canceled" });
    expect((await itemOf(t.item_id)).status).toBe("archived");
  });

  it("priorité, échéance et étiquettes", async () => {
    const t = await bossTask();
    const u = await updateTask(db, t.id, { priority: "high", dueOn: "2020-01-10", labels: [" Bug ", "bug", "UX", ""] });
    expect(u).toMatchObject({ priority: "high", due_on: "2020-01-10", labels: ["bug", "ux"], urgent: false });
    const item = await itemOf(t.item_id);
    expect(item.priority_reasons).toEqual(expect.arrayContaining(["Priorité haute"]));
    expect(item.priority_reasons.some((r) => r.startsWith("En retard"))).toBe(true);
    expect(item.due_at?.toISOString()).toBe("2020-01-10T17:00:00.000Z"); // 18 h à Paris
  });

  it("« bloquant » coché par le client = priorité urgente", async () => {
    const t = await createTicket(db, { kind: "task", clientId: x, projectId: app, contactId: boss, author: "client", subject: "Panne", body: "b", urgent: true });
    expect(t.priority).toBe("urgent");
    expect((await itemOf(t.item_id)).priority_reasons).toContain("Priorité urgente");
  });

  it("changer de colonne place la tâche en bas ; glisser-déposer garde la position donnée", async () => {
    const a = await bossTask("A");
    const b = await bossTask("B");
    expect(b.position).toBeGreaterThan(a.position);
    const moved = await updateTask(db, a.id, { status: "in_progress" });
    expect(moved?.position).toBe(1);
    const dropped = await moveTask(db, b.id, "in_progress", 0.5);
    expect(dropped).toMatchObject({ status: "in_progress", position: 0.5 });
    expect((await itemOf(b.item_id)).status).toBe("in_progress");
  });
});

describe("espaces de travail", () => {
  it("admin : compteurs et tâches avec projet, auteur et assigné", async () => {
    const { getWorkspace, listWorkspaces } = await import("@/lib/workspaces/queries");
    const t = await bossTask();
    await updateTask(db, t.id, { assignee: boss, labels: ["ux"] });
    await createTicket(db, { kind: "task", clientId: x, author: "admin", subject: "Sans projet", body: "-" });
    const row = (await listWorkspaces(db)).find((w) => w.id === x)!;
    expect(row).toMatchObject({ members: 1, projects: 2, todo: 2, kind: "client" });
    const ws = await getWorkspace(db, x);
    const card = ws!.tasks.find((k) => k.id === t.id)!;
    expect(card).toMatchObject({ project_name: "App planning", author_name: "Le Patron", assignee_name: "Le Patron", labels: ["ux"], replies: 0 });
  });

  it("portail : son espace seulement, sans les tâches des brouillons", async () => {
    const { getPortalWorkspace } = await import("@/lib/auth/access");
    const visible = await bossTask();
    const loose = await createTicket(db, { kind: "task", clientId: x, author: "admin", subject: "Sans projet", body: "-" });
    await createTicket(db, { kind: "task", clientId: x, projectId: draft, author: "admin", subject: "Secret", body: "-" });
    const ws = await getPortalWorkspace(db, [x], x);
    expect(ws?.tasks.map((k) => k.id).sort()).toEqual([visible.id, loose.id].sort());
    expect(ws?.projects.map((p) => p.name)).toEqual(["App planning"]);
    expect(ws?.members.map((m) => m.name)).toEqual(["Le Patron"]);
    const [other] = await db.insert(clients).values({ name: "Autre", slug: "autre" }).returning();
    expect(await getPortalWorkspace(db, [other!.id], x)).toBeNull();
  });
});
