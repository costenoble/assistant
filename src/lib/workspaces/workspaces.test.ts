import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, emailMessages, items, meetings, projects, tickets } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { createTicket } from "@/lib/tickets/service";
import { deleteWorkspace, workspaceFootprint } from "./delete";

let db: Db;
let ws: string, other: string;
beforeEach(async () => {
  db = await createTestDb();
  const [a, b] = await db.insert(clients).values([{ name: "À supprimer", slug: "a-supprimer" }, { name: "À garder", slug: "a-garder" }]).returning();
  [ws, other] = [a!.id, b!.id];
});

describe("suppression d'un espace", () => {
  it("tout ce qui lui appartient disparaît, le reste est intact, les mails sont gardés", async () => {
    const [p] = await db.insert(projects).values({ client_id: ws, name: "Projet" }).returning();
    await db.insert(clientContacts).values({ client_id: ws, full_name: "Marc", email: "marc@x.fr", portal_access: true });
    await db.insert(meetings).values({ client_id: ws, title: "Point" });
    const t = await createTicket(db, { kind: "task", clientId: ws, projectId: p!.id, author: "admin", subject: "Tâche", body: "b" });
    const keep = await createTicket(db, { kind: "task", clientId: other, author: "admin", subject: "Autre", body: "b" });
    const [mail] = await db.insert(items).values({ kind: "email", title: "Mail du client", client_id: ws }).returning();
    await db.insert(emailMessages).values({ item_id: mail!.id, account_id: "c", uid: 1, uid_validity: 1, received_at: new Date() });

    expect(await workspaceFootprint(db, ws)).toEqual({ projects: 1, tickets: 1, meetings: 1, contacts: 1 });
    await deleteWorkspace(db, ws);

    expect(await db.select().from(clients).where(eq(clients.id, ws))).toEqual([]);
    expect(await db.$count(projects)).toBe(0);
    expect(await db.$count(meetings)).toBe(0);
    expect(await db.$count(clientContacts)).toBe(0);
    expect((await db.select().from(tickets)).map((x) => x.id)).toEqual([keep.id]);
    // La copie de la tâche dans « Aujourd'hui » est partie, celle de l'autre espace est restée.
    expect(await db.select().from(items).where(eq(items.id, t.item_id!))).toEqual([]);
    expect((await db.select().from(items).where(eq(items.id, keep.item_id!))).length).toBe(1);
    // Le mail est gardé, détaché de l'espace.
    const [m] = await db.select().from(items).where(eq(items.id, mail!.id));
    expect(m).toMatchObject({ kind: "email", client_id: null });
  });
});
