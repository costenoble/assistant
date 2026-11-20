import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { avatarUrl } from "./avatar-url";
import { avatarKeyFor, getOwnerProfile, setAvatar, setOwnerName, updateMemberProfile } from "./service";

let db: Db;
let a: string, b: string, other: string;
beforeEach(async () => {
  db = await createTestDb();
  const ws = await db.insert(clients).values([{ name: "A", slug: "a" }, { name: "B", slug: "b" }, { name: "Autre", slug: "autre" }]).returning();
  [a, b, other] = ws.map((w) => w.id) as [string, string, string];
  await db.insert(clientContacts).values([
    { client_id: a, full_name: "Marc", email: "marc@x.fr", portal_access: true },
    { client_id: b, full_name: "Marc D.", email: "marc@x.fr", portal_access: true },
    { client_id: other, full_name: "Claire", email: "claire@y.fr", portal_access: true },
  ]);
});
afterAll(() => rm(path.join(process.cwd(), ".data", "uploads"), { recursive: true, force: true }));

describe("profils", () => {
  it("un membre présent dans deux espaces : profil et photo appliqués partout", async () => {
    await updateMemberProfile(db, "marc@x.fr", { full_name: "Marc Dubois", job_title: "Directeur", phone: "06", notify_email: false });
    const key = await setAvatar(db, { kind: "member", email: "marc@x.fr" }, Buffer.from("img"), "image/webp");
    const rows = await db.select().from(clientContacts).where(eq(clientContacts.email, "marc@x.fr"));
    expect(rows.map((r) => [r.full_name, r.job_title, r.notify_email, r.avatar_key])).toEqual([
      ["Marc Dubois", "Directeur", false, key],
      ["Marc Dubois", "Directeur", false, key],
    ]);
  });

  it("photo d'un membre : visible de toi et des membres de ses espaces seulement", async () => {
    await setAvatar(db, { kind: "member", email: "marc@x.fr" }, Buffer.from("img"));
    const [marcA] = await db.select().from(clientContacts).where(eq(clientContacts.client_id, a));
    expect(await avatarKeyFor(db, { kind: "owner" }, marcA!.id)).toBeTruthy();
    expect(await avatarKeyFor(db, { kind: "member", clientIds: [a] }, marcA!.id)).toBeTruthy();
    expect(await avatarKeyFor(db, { kind: "member", clientIds: [other] }, marcA!.id)).toBeNull();
    expect(await avatarKeyFor(db, { kind: "member", clientIds: [] }, marcA!.id)).toBeNull();
  });

  it("ton profil : nom et photo, l'ancienne photo est remplacée", async () => {
    await setOwnerName(db, "  Ryan Costenoble ");
    const k1 = await setAvatar(db, { kind: "owner" }, Buffer.from("1"));
    const k2 = await setAvatar(db, { kind: "owner" }, Buffer.from("2"));
    expect(k1).not.toBe(k2);
    expect(await getOwnerProfile(db)).toEqual({ name: "Ryan Costenoble", avatar_key: k2 });
    expect(avatarUrl("moi", k2)).toMatch(/^\/avatars\/moi\?v=[0-9a-f]{8}$/);
    expect(avatarUrl("moi", null)).toBeNull();
  });
});
