import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, items, projects, ticketMessages } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { getPortalTicket, getPortalTickets, resolvePortalTicketTarget } from "@/lib/auth/access";
import { recomputePriorities } from "@/lib/items/repo";
import { addTicketMessage, createTicket, setTicketStatus } from "./service";
import { listTickets } from "./queries";

let db: Db;
let x: string, y: string, jean: string, projX: string, draftX: string, projY: string;
const itemOf = async (id: string | null) => (await db.select().from(items).where(eq(items.id, id!)))[0]!;

beforeEach(async () => {
  db = await createTestDb();
  const c = await db.insert(clients).values([{ name: "Client X", slug: "client-x" }, { name: "Client Y", slug: "client-y" }]).returning();
  [x, y] = [c[0]!.id, c[1]!.id];
  const [ct] = await db.insert(clientContacts).values({ client_id: x, full_name: "Jean", email: "jean@x.fr", portal_access: true }).returning();
  jean = ct!.id;
  const p = await db
    .insert(projects)
    .values([
      { client_id: x, name: "Site X", status: "active" },
      { client_id: x, name: "Brouillon X", status: "draft" },
      { client_id: y, name: "Site Y", status: "active" },
    ])
    .returning();
  [projX, draftX, projY] = [p[0]!.id, p[1]!.id, p[2]!.id];
});

const open = (over: Partial<Parameters<typeof createTicket>[1]> = {}) =>
  createTicket(db, { clientId: x, contactId: jean, author: "client", subject: "Formulaire en panne", body: "Le formulaire ne s'envoie plus.", ...over });

describe("cycle de vie", () => {
  it("une demande client crée un ticket numéroté et un item dans le flux", async () => {
    const t = await open({ projectId: projX });
    const t2 = await open();
    expect(t2.number).toBe(t.number + 1);
    expect(t.status).toBe("open");
    const item = await itemOf(t.item_id);
    expect(item).toMatchObject({ kind: "ticket", status: "todo", client_id: x, project_id: projX, url: `/tickets/${t.id}` });
    expect(item.title).toBe(`#${t.number} · Formulaire en panne`);
    expect(item.priority_reasons).toContain("Demande client");
    expect(item.priority_reasons).toContain("Mot-clé « en panne »");
  });

  it("réponse admin → attente du client ; le client répond → à traiter", async () => {
    const t = await open();
    let r = await addTicketMessage(db, t.id, { author: "admin", body: "Je regarde." });
    expect(r.ticket.status).toBe("waiting_client");
    expect((await itemOf(t.item_id)).status).toBe("waiting");

    r = await addTicketMessage(db, t.id, { author: "client", contactId: jean, body: "Merci, toujours en panne." });
    expect(r.ticket.status).toBe("open");
    expect(r.reopened).toBe(true);
    expect((await itemOf(t.item_id)).status).toBe("todo");
  });

  it("répondre et résoudre ; une réponse du client rouvre la demande", async () => {
    const t = await open();
    let r = await addTicketMessage(db, t.id, { author: "admin", body: "Corrigé.", resolve: true });
    expect(r.ticket.status).toBe("resolved");
    const done = await itemOf(t.item_id);
    expect(done.status).toBe("done");
    expect(done.completed_at).toBeInstanceOf(Date);

    r = await addTicketMessage(db, t.id, { author: "client", contactId: jean, body: "Ça recommence." });
    expect(r.ticket.status).toBe("open");
    expect((await itemOf(t.item_id)).completed_at).toBeNull();
  });

  it("une note interne ne change pas le statut et n'est jamais montrée au client", async () => {
    const t = await open();
    await setTicketStatus(db, t.id, "in_progress");
    const r = await addTicketMessage(db, t.id, { author: "admin", body: "Penser à facturer.", internal: true });
    expect(r.ticket.status).toBe("in_progress");
    expect((await itemOf(t.item_id)).status).toBe("in_progress");
    const seen = await getPortalTicket(db, [x], t.id);
    expect(seen?.messages.map((m) => m.body)).toEqual(["Le formulaire ne s'envoie plus."]);
  });

  it("un client ne peut pas poser une note interne", async () => {
    const t = await open();
    await addTicketMessage(db, t.id, { author: "client", contactId: jean, body: "Bonjour", internal: true });
    const rows = await db.select().from(ticketMessages).where(eq(ticketMessages.ticket_id, t.id));
    expect(rows.every((m) => !m.internal)).toBe(true);
  });

  it("ouvert par l'admin : en attente du client", async () => {
    const t = await createTicket(db, { clientId: x, author: "admin", subject: "Accès FTP", body: "Pouvez-vous m'envoyer les accès ?" });
    expect(t.status).toBe("waiting_client");
    expect((await itemOf(t.item_id)).status).toBe("waiting");
  });
});

describe("priorité", () => {
  it("bloquant et attente du client font remonter le ticket", async () => {
    const t = await open({ urgent: true });
    const later = new Date(Date.now() + 3 * 86_400_000);
    await recomputePriorities(db, later);
    const item = await itemOf(t.item_id);
    expect(item.priority_reasons).toEqual(expect.arrayContaining(["Signalée bloquante par le client", "Client sans réponse depuis 3 j"]));
    expect(item.priority_level).toBe("critical");
  });
});

describe("portail : isolation", () => {
  it("un contact ne voit que les demandes de ses clients", async () => {
    const mine = await open();
    const other = await createTicket(db, { clientId: y, author: "client", subject: "Autre", body: "Chez Y" });
    expect((await getPortalTickets(db, [x])).map((t) => t.id)).toEqual([mine.id]);
    expect(await getPortalTicket(db, [x], other.id)).toBeNull();
    expect(await getPortalTickets(db, [])).toEqual([]);
  });

  it("cible d'une nouvelle demande : seulement ses projets publiés et ses clients", async () => {
    expect(await resolvePortalTicketTarget(db, [x], { projectId: projX })).toEqual({ clientId: x, projectId: projX });
    expect(await resolvePortalTicketTarget(db, [x], {})).toEqual({ clientId: x, projectId: null });
    expect(await resolvePortalTicketTarget(db, [x], { projectId: projY })).toBeNull(); // projet d'un autre client
    expect(await resolvePortalTicketTarget(db, [x], { projectId: draftX })).toBeNull(); // brouillon
    expect(await resolvePortalTicketTarget(db, [x], { clientId: y })).toBeNull();
    expect(await resolvePortalTicketTarget(db, [x, y], {})).toBeNull(); // deux clients : il faut choisir
    expect(await resolvePortalTicketTarget(db, [x, y], { clientId: y })).toEqual({ clientId: y, projectId: null });
    expect(await resolvePortalTicketTarget(db, [x], { clientId: y, projectId: projX })).toBeNull();
  });
});

describe("liste admin", () => {
  it("à traiter : bloquants d'abord ; filtres par statut", async () => {
    const a = await open({ subject: "Normal" });
    const b = await open({ subject: "Bloquant", urgent: true });
    const c = await open({ subject: "Répondu" });
    await addTicketMessage(db, c.id, { author: "admin", body: "ok" });
    expect((await listTickets(db, "todo")).map((t) => t.id)).toEqual([b.id, a.id]);
    expect((await listTickets(db, "waiting")).map((t) => t.id)).toEqual([c.id]);
    expect(await listTickets(db, "resolved")).toEqual([]);
  });
});
