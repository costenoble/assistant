import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { clientContacts, clients, emailMessages, items, meetings, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { createTicket } from "@/lib/tickets/service";
import { searchAll } from "./queries";

let db: Db;
let ws: string;
beforeEach(async () => {
  db = await createTestDb();
  const [c] = await db.insert(clients).values({ name: "Semaphors", slug: "semaphors" }).returning();
  ws = c!.id;
  await db.insert(clientContacts).values({ client_id: ws, full_name: "Marc Dubois", email: "marc@semaphors.com" });
  await db.insert(projects).values({ client_id: ws, name: "App planning", description: "Planning des équipes terrain" });
  await db.insert(meetings).values({ client_id: ws, title: "Point hebdo", transcript: "[00:12] la connexion SSO est en panne", status: "ready" });
  const [it] = await db.insert(items).values({ kind: "email", title: "Facture octobre" }).returning();
  await db.insert(emailMessages).values({ item_id: it!.id, account_id: "c", uid: 1, uid_validity: 1, from_name: "Comptabilité", from_address: "compta@semaphors.com", subject: "Facture octobre", received_at: new Date() });
  await db.insert(items).values({ kind: "task", title: "Renouveler le nom de domaine", status: "todo" });
});

describe("recherche globale", () => {
  it("trouve dans chaque type, avec le bon lien", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, author: "admin", subject: "Corriger la connexion SSO", body: "Erreur au login" });
    const r = await searchAll(db, "sso");
    expect(r.map((x) => [x.group, x.href])).toEqual(
      expect.arrayContaining([
        ["Tickets et tâches d'espace", `/tickets/${t.id}`],
        ["Réunions", expect.stringMatching(/^\/reunions\//)],
      ]),
    );
    expect((await searchAll(db, "COMPTA")).find((x) => x.group === "Mails")).toMatchObject({ title: "Facture octobre", href: expect.stringMatching(/^\/inbox\//) });
    expect((await searchAll(db, "marc@sema")).find((x) => x.group === "Contacts")).toMatchObject({ title: "Marc Dubois", href: `/clients/${ws}` });
    expect((await searchAll(db, "terrain")).find((x) => x.group === "Projets")?.href).toMatch(new RegExp(`^/espaces/${ws}\\?projet=`));
    expect((await searchAll(db, "domaine")).find((x) => x.group === "Tâches")?.title).toBe("Renouveler le nom de domaine");
    expect((await searchAll(db, "sema")).some((x) => x.group === "Clients" && x.href === `/clients/${ws}`)).toBe(true);
  });

  it("« #N » ouvre le ticket n°N ; requêtes trop courtes ou spéciales sans effet", async () => {
    const t = await createTicket(db, { kind: "request", clientId: ws, author: "admin", subject: "Question", body: "b" });
    expect((await searchAll(db, `#${t.number}`))[0]).toMatchObject({ href: `/tickets/${t.id}`, title: `#${t.number} Question` });
    expect(await searchAll(db, "a")).toEqual([]);
    expect(await searchAll(db, "%%")).toEqual([]);
  });
});
