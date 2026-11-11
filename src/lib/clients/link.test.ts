import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, emailMessages, items } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { findClientByRef, getClientActivity, linkItemsToClients } from "./link";

let db: Db;
let leroy: string;
let martin: string;

async function mail(from: string, title = "Sujet") {
  const [it] = await db.insert(items).values({ kind: "email", title }).returning({ id: items.id });
  await db.insert(emailMessages).values({
    item_id: it!.id, account_id: "a", uid: Math.floor(Math.random() * 1e9), uid_validity: 1,
    from_address: from, received_at: new Date(),
  });
  return it!.id;
}
const clientOf = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]!.client_id;

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db
    .insert(clients)
    .values([
      { name: "Cabinet Leroy", slug: "cabinet-leroy", email_domains: ["cabinet-leroy.fr"] },
      { name: "Boulangerie Martin", slug: "boulangerie-martin" },
    ])
    .returning({ id: clients.id });
  [leroy, martin] = [rows[0]!.id, rows[1]!.id];
  // Paul écrit depuis une adresse perso : seul son contact le relie à la boulangerie.
  await db.insert(clientContacts).values({ client_id: martin, full_name: "Paul Martin", email: "paul.martin@gmail.com" });
});

describe("linkItemsToClients", () => {
  it("rattache par domaine, sous-domaine et adresse de contact", async () => {
    const byDomain = await mail("claire@cabinet-leroy.fr");
    const bySubdomain = await mail("compta@mail.cabinet-leroy.fr");
    const byContact = await mail("paul.martin@gmail.com");
    const unknown = await mail("quelquun@gmail.com");
    const lookalike = await mail("x@faux-cabinet-leroy.fr");

    expect(await linkItemsToClients(db)).toBe(3);
    expect(await clientOf(byDomain)).toBe(leroy);
    expect(await clientOf(bySubdomain)).toBe(leroy);
    expect(await clientOf(byContact)).toBe(martin);
    expect(await clientOf(unknown)).toBeNull();
    expect(await clientOf(lookalike)).toBeNull();
    expect(await linkItemsToClients(db)).toBe(0); // rien à refaire
  });

  it("ne remplace jamais un rattachement existant", async () => {
    const id = await mail("claire@cabinet-leroy.fr");
    await db.update(items).set({ client_id: martin }).where(eq(items.id, id));
    await linkItemsToClients(db);
    expect(await clientOf(id)).toBe(martin);
  });

  it("le contact exact passe avant le domaine", async () => {
    await db.insert(clientContacts).values({ client_id: martin, full_name: "Externe", email: "presta@cabinet-leroy.fr" });
    const id = await mail("presta@cabinet-leroy.fr");
    await linkItemsToClients(db);
    expect(await clientOf(id)).toBe(martin);
  });

  it("laisse les tâches sans mail tranquilles", async () => {
    const [t] = await db.insert(items).values({ kind: "task", title: "Tâche" }).returning({ id: items.id });
    await linkItemsToClients(db);
    expect(await clientOf(t!.id)).toBeNull();
  });
});

describe("findClientByRef", () => {
  it("slug exact, ou début de slug s'il est unique", async () => {
    expect(await findClientByRef(db, "cabinet-leroy")).toBe(leroy);
    expect(await findClientByRef(db, "Cabinet")).toBe(leroy);
    expect(await findClientByRef(db, "boul")).toBe(martin);
    expect(await findClientByRef(db, "inconnu")).toBeNull();
    await db.insert(clients).values({ name: "Cabinet Durand", slug: "cabinet-durand" });
    expect(await findClientByRef(db, "cabinet")).toBeNull(); // ambigu
    expect(await findClientByRef(db, "%")).toBeNull();
  });
});

describe("getClientActivity", () => {
  it("ne renvoie que les items du client, ouverts et clos séparés", async () => {
    await db.insert(items).values([
      { title: "Ouverte", kind: "task", status: "todo", client_id: leroy },
      { title: "Finie", kind: "task", status: "done", client_id: leroy },
      { title: "Autre client", kind: "task", status: "todo", client_id: martin },
      { title: "Sans client", kind: "task", status: "todo" },
    ]);
    const a = await getClientActivity(db, leroy);
    expect(a.open.map((i) => i.title)).toEqual(["Ouverte"]);
    expect(a.closed.map((i) => i.title)).toEqual(["Finie"]);
  });
});
