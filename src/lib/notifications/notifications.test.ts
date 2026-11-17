import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { clientContacts, clients, notifications, pushSubscriptions } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";

// Services de notification (Apple, Google…) simulés : 410 = appareil désabonné.
const sent: { endpoint: string; payload: string }[] = [];
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    }),
  },
}));

const { countUnread, listNotifications, markAllRead, notify, savePushSubscription, sendPush } = await import("./service");

let db: Db;
beforeEach(async () => {
  sent.length = 0;
  db = await createTestDb();
  vi.unstubAllEnvs();
});

describe("notifications", () => {
  it("cloche : création, compteur, tout lire", async () => {
    await notify(db, { kind: "client_new", title: "Nouvelle tâche — Export", body: "Marc : export CSV", url: "/tickets/1" });
    await notify(db, { kind: "urgent_mail", title: "Mail urgent · Marc", url: "/inbox/2" });
    expect(await countUnread(db)).toBe(2);
    expect((await listNotifications(db)).map((n) => n.title)).toEqual(["Mail urgent · Marc", "Nouvelle tâche — Export"]);
    await markAllRead(db);
    expect(await countUnread(db)).toBe(0);
  });

  it("sans clés VAPID : la cloche marche, rien n'est envoyé aux appareils", async () => {
    await savePushSubscription(db, { endpoint: "https://push.example/a", p256dh: "p".repeat(20), auth: "a".repeat(10) }, "iPhone");
    expect(await sendPush(db, { kind: "x", title: "t", url: "/" })).toEqual({ sent: 0, removed: 0 });
    expect(sent).toHaveLength(0);
  });

  it("avec clés : envoyé à chaque appareil, appareil désabonné oublié", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
    await savePushSubscription(db, { endpoint: "https://push.example/ok", p256dh: "p".repeat(20), auth: "a".repeat(10) }, "iPhone");
    await savePushSubscription(db, { endpoint: "https://push.example/gone", p256dh: "p".repeat(20), auth: "a".repeat(10) }, "Mac");
    const r = await sendPush(db, { kind: "client_new", title: "Nouvelle tâche", body: "b", url: "/tickets/1", tag: "ticket-1" });
    expect(r).toEqual({ sent: 1, removed: 1 });
    expect(JSON.parse(sent[0]!.payload)).toEqual({ title: "Nouvelle tâche", body: "b", url: "/tickets/1", tag: "ticket-1" });
    expect((await db.select().from(pushSubscriptions)).map((s) => s.device)).toEqual(["iPhone"]);
  });

  it("un client qui crée une tâche déclenche une notification", async () => {
    const { createTicket } = await import("@/lib/tickets/service");
    const { notifyOwnerOfClientMessage } = await import("@/lib/tickets/notify");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("OWNER_EMAIL", "admin@test.dev");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
    vi.stubEnv("CRON_SECRET", "y".repeat(16));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const [c] = await db.insert(clients).values({ name: "Semaphors", slug: "semaphors" }).returning();
    const [m] = await db.insert(clientContacts).values({ client_id: c!.id, full_name: "Marc Dubois", portal_access: true }).returning();
    const t = await createTicket(db, { kind: "task", clientId: c!.id, contactId: m!.id, author: "client", subject: "Export CSV", body: "Pour la paie" });
    await notifyOwnerOfClientMessage(db, t, "Pour la paie", "new", "Marc Dubois");
    log.mockRestore();
    const [n] = await db.select().from(notifications);
    expect(n).toMatchObject({ kind: "client_new", title: "Nouvelle tâche — Export CSV", url: `/tickets/${t.id}` });
    expect(n!.body).toContain("Marc Dubois");
  });
});
