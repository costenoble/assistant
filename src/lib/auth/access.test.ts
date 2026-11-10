import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { canSignIn, getPortalAccess, getPortalProjects } from "./access";

const OWNER = "ryan@cstlab.dev";
let db: Db;
let x: string;
let y: string;

beforeEach(async () => {
  db = await createTestDb();
  const rows = await db
    .insert(clients)
    .values([{ name: "Client X", slug: "client-x" }, { name: "Client Y", slug: "client-y" }])
    .returning({ id: clients.id });
  [x, y] = [rows[0]!.id, rows[1]!.id];
  await db.insert(clientContacts).values([
    { client_id: x, full_name: "Jean", email: "jean@client-x.fr", portal_access: true },
    { client_id: x, full_name: "Paul", email: "paul@client-x.fr", portal_access: false },
    { client_id: y, full_name: "Marie", email: "marie@client-y.fr", portal_access: true },
  ]);
  await db.insert(projects).values([
    { client_id: x, name: "Site X", status: "active" },
    { client_id: x, name: "Brouillon X", status: "draft" },
    { client_id: y, name: "Site Y", status: "review" },
  ]);
});

describe("portail : isolation entre clients", () => {
  it("un contact ne voit que son client et ses projets publiés", async () => {
    const jean = await getPortalAccess(db, "Jean@Client-X.fr");
    expect(jean?.clients.map((c) => c.name)).toEqual(["Client X"]);
    expect((await getPortalProjects(db, jean!.clientIds)).map((p) => p.name)).toEqual(["Site X"]);

    const marie = await getPortalAccess(db, "marie@client-y.fr");
    expect((await getPortalProjects(db, marie!.clientIds)).map((p) => p.name)).toEqual(["Site Y"]);
  });

  it("sans accès portail : rien", async () => {
    expect(await getPortalAccess(db, "paul@client-x.fr")).toBeNull();
    expect(await getPortalAccess(db, "inconnu@evil.com")).toBeNull();
    expect(await getPortalProjects(db, [])).toEqual([]);
  });

  it("retirer l'accès ou archiver le client coupe tout de suite", async () => {
    await db.update(clientContacts).set({ portal_access: false }).where(eq(clientContacts.email, "jean@client-x.fr"));
    expect(await getPortalAccess(db, "jean@client-x.fr")).toBeNull();

    await db.update(clients).set({ status: "archived" }).where(eq(clients.id, y));
    expect(await getPortalAccess(db, "marie@client-y.fr")).toBeNull();
  });

  it("un contact présent chez deux clients voit les deux", async () => {
    await db.insert(clientContacts).values({ client_id: y, full_name: "Jean", email: "jean@client-x.fr", portal_access: true });
    const jean = await getPortalAccess(db, "jean@client-x.fr");
    expect(jean?.clients.map((c) => c.name)).toEqual(["Client X", "Client Y"]);
  });
});

describe("canSignIn", () => {
  it("admin et contacts avec accès seulement", async () => {
    expect(await canSignIn(db, "RYAN@cstlab.dev", OWNER)).toBe(true);
    expect(await canSignIn(db, "jean@client-x.fr", OWNER)).toBe(true);
    expect(await canSignIn(db, "paul@client-x.fr", OWNER)).toBe(false);
    expect(await canSignIn(db, "inconnu@evil.com", OWNER)).toBe(false);
  });
});
