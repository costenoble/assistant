import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, user } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { createAuth } from "./auth";

const OWNER = "ryan@cstlab.dev";
const BASE = "http://localhost:3000";
let db: Db;
let links: Record<string, string>;
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = await createTestDb();
  links = {};
  auth = createAuth(db, {
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-1234",
    ownerEmail: OWNER,
    sendLink: async (email, url) => void (links[email] = url),
  });
});

/** Demande un lien, le « clique », et renvoie la réponse + le cookie de session obtenu. */
async function signIn(email: string) {
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/", errorCallbackURL: "/login" },
    headers: new Headers(),
  });
  return click(links[email]!);
}

async function click(url: string) {
  const res = await auth.handler(new Request(url));
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const session = cookie ? await auth.api.getSession({ headers: new Headers({ cookie }) }) : null;
  return { location: res.headers.get("location"), session };
}

describe("connexion par lien magique", () => {
  it("l'admin se connecte et obtient une session", async () => {
    const { location, session } = await signIn(OWNER);
    expect(links[OWNER]).toContain(`${BASE}/api/auth/magic-link/verify?token=`);
    expect(location).toBe(`${BASE}/`);
    expect(session?.user.email).toBe(OWNER);
  });

  it("un lien ne sert qu'une fois", async () => {
    await signIn(OWNER);
    const again = await click(links[OWNER]!);
    expect(again.session).toBeNull();
    expect(again.location).toContain(`${BASE}/login?error=`);
  });

  it("un contact avec accès portail se connecte", async () => {
    const [c] = await db.insert(clients).values({ name: "X", slug: "client-x" }).returning();
    await db.insert(clientContacts).values({ client_id: c!.id, full_name: "Jean", email: "jean@client-x.fr", portal_access: true });
    const { session } = await signIn("jean@client-x.fr");
    expect(session?.user.email).toBe("jean@client-x.fr");
  });

  it("aucun compte n'est créé pour une adresse non autorisée, même avec un lien valide", async () => {
    const { session } = await signIn("inconnu@evil.com");
    expect(session).toBeNull();
    expect(await db.$count(user, eq(user.email, "inconnu@evil.com"))).toBe(0);
  });

  it("un lien émis avant le retrait de l'accès ne crée plus de compte", async () => {
    const [c] = await db.insert(clients).values({ name: "X", slug: "client-x" }).returning();
    await db.insert(clientContacts).values({ client_id: c!.id, full_name: "Jean", email: "jean@client-x.fr", portal_access: true });
    await auth.api.signInMagicLink({ body: { email: "jean@client-x.fr", callbackURL: "/" }, headers: new Headers() });
    await db.update(clientContacts).set({ portal_access: false });
    const { session } = await click(links["jean@client-x.fr"]!);
    expect(session).toBeNull();
    expect(await db.$count(user)).toBe(0);
  });
});
