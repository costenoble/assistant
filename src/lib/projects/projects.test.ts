import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { clientContacts, clients, meetings } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { addTicketMessage, createTicket, updateTask } from "@/lib/tickets/service";
import { activityFeed, getProjectPage, projectCards } from "./overview";
import { addMilestone, createProject, deleteMilestone, leadAllowed, postProjectUpdate, setTaskMilestone, updateProject } from "./service";

let db: Db;
let ws: string, other: string, marc: string, stranger: string;
beforeEach(async () => {
  db = await createTestDb();
  const [a, b] = await db.insert(clients).values([{ name: "Semaphors", slug: "semaphors" }, { name: "Autre", slug: "autre" }]).returning();
  [ws, other] = [a!.id, b!.id];
  const c = await db
    .insert(clientContacts)
    .values([
      { client_id: ws, full_name: "Marc Dubois", portal_access: true },
      { client_id: other, full_name: "Intrus", portal_access: true },
    ])
    .returning();
  [marc, stranger] = [c[0]!.id, c[1]!.id];
});

describe("projets visuels", () => {
  it("carte : avancement, à valider, responsable, dernière santé", async () => {
    const p = await createProject(db, ws, { name: "App planning", color: "violet", dueOn: "2026-12-15", lead: marc });
    const t1 = await createTicket(db, { kind: "task", clientId: ws, projectId: p.id, author: "admin", subject: "A", body: "-" });
    await createTicket(db, { kind: "task", clientId: ws, projectId: p.id, author: "admin", subject: "B", body: "-", task: { status: "waiting_client" } });
    await createTicket(db, { kind: "task", clientId: ws, projectId: p.id, author: "admin", subject: "C", body: "-", task: { status: "canceled" } });
    await updateTask(db, t1.id, { status: "resolved" });
    await postProjectUpdate(db, p.id, "at_risk", "La recette glisse d'une semaine.");
    const [card] = await projectCards(db, ws, { portal: true });
    expect(card).toMatchObject({ name: "App planning", color: "violet", due_on: "2026-12-15", lead: "Marc Dubois", total: 2, done: 1, to_validate: 1, health: "at_risk" });
  });

  it("projet créé par un membre : actif, il en est le responsable ; créé par toi : tu l'es", async () => {
    const byMember = await createProject(db, ws, { name: "Refonte RH" }, marc);
    expect(byMember).toMatchObject({ status: "active", created_by_contact_id: marc, lead_contact_id: marc, lead_is_owner: false });
    const byOwner = await createProject(db, ws, { name: "Stocks" });
    expect(byOwner).toMatchObject({ lead_is_owner: true, lead_contact_id: null });
    expect(await leadAllowed(db, ws, stranger)).toBe(false);
    expect(await leadAllowed(db, ws, marc)).toBe(true);
    expect(await updateProject(db, byOwner.id, { status: "review", color: "green" })).toMatchObject({ status: "review", color: "green" });
  });

  it("côté membre : brouillons invisibles (carte, page, activité)", async () => {
    const draft = await createProject(db, ws, { name: "Secret", status: "draft" });
    await createTicket(db, { kind: "task", clientId: ws, projectId: draft.id, author: "admin", subject: "Tâche secrète", body: "-" });
    expect((await projectCards(db, ws, { portal: true })).map((c) => c.name)).toEqual([]);
    expect((await projectCards(db, ws, { portal: false })).map((c) => c.name)).toEqual(["Secret"]);
    expect(await getProjectPage(db, draft.id, { portal: true })).toBeNull();
    const feed = await activityFeed(db, { workspaceId: ws }, { portal: true });
    expect(feed.some((e) => e.text.includes("Secret"))).toBe(false);
  });

  it("jalons : progression, rattachement limité au même projet, suppression sans perte de tâches", async () => {
    const p = await createProject(db, ws, { name: "App" });
    const q = await createProject(db, ws, { name: "Autre projet" });
    const v1 = await addMilestone(db, p.id, "V1", "2026-12-01");
    const elsewhere = await addMilestone(db, q.id, "Ailleurs", null);
    const t = await createTicket(db, { kind: "task", clientId: ws, projectId: p.id, author: "admin", subject: "Écran", body: "-" });
    expect(await setTaskMilestone(db, t.id, elsewhere.id)).toBe(false);
    expect(await setTaskMilestone(db, t.id, v1.id)).toBe(true);
    await updateTask(db, t.id, { status: "resolved" });
    const page = await getProjectPage(db, p.id, { portal: false });
    expect(page?.milestones).toEqual([expect.objectContaining({ name: "V1", total: 1, done: 1 })]);
    expect(page?.progress).toEqual({ total: 1, done: 1 });
    await deleteMilestone(db, v1.id);
    expect((await getProjectPage(db, p.id, { portal: false }))?.tasks.map((x) => x.subject)).toEqual(["Écran"]);
  });

  it("activité : sans notes internes ni réunions non partagées côté membre", async () => {
    const p = await createProject(db, ws, { name: "App" });
    const t = await createTicket(db, { kind: "task", clientId: ws, projectId: p.id, contactId: marc, author: "client", subject: "Export", body: "-" });
    await addTicketMessage(db, t.id, { author: "admin", body: "note privée", internal: true });
    await addTicketMessage(db, t.id, { author: "client", contactId: marc, body: "Merci" });
    await db.insert(meetings).values([
      { client_id: ws, project_id: p.id, title: "Réunion privée", status: "ready", shared: false },
      { client_id: ws, project_id: p.id, title: "Point partagé", status: "ready", shared: true },
    ]);
    const member = await activityFeed(db, { workspaceId: ws, projectId: p.id }, { portal: true });
    expect(member.filter((e) => e.kind === "comment")).toHaveLength(1);
    expect(member.find((e) => e.kind === "comment")).toMatchObject({ who: "Marc Dubois" });
    expect(member.filter((e) => e.kind === "meeting").map((e) => e.text)).toEqual(["a partagé le compte rendu « Point partagé »"]);
    expect(member.find((e) => e.kind === "task_created")).toMatchObject({ who: "Marc Dubois", text: "a ajouté la tâche « Export »" });
    const admin = await activityFeed(db, { workspaceId: ws, projectId: p.id }, { portal: false });
    expect(admin.filter((e) => e.kind === "meeting")).toHaveLength(2);
    const pagePortal = await getProjectPage(db, p.id, { portal: true });
    expect(pagePortal?.meetings.map((m) => m.title)).toEqual(["Point partagé"]);
  });
});
