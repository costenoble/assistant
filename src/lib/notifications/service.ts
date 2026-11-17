import "server-only";
import webpush from "web-push";
import { desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { notifications, pushSubscriptions } from "@/lib/db/schema";
import { pushConfig } from "@/lib/env";

/**
 * Notifications : la cloche dans l'app, et le même message envoyé aux appareils
 * abonnés (Web Push). L'envoi ne fait jamais échouer l'action qui le déclenche.
 */

export interface NewNotification {
  kind: string;
  title: string;
  body?: string | null;
  /** Chemin interne à ouvrir, ex. /tickets/… */
  url: string;
  /** Même tag = la notification remplace la précédente sur le téléphone (pas d'empilement). */
  tag?: string;
}

export async function notify(db: Db, n: NewNotification) {
  try {
    await db.insert(notifications).values({ kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 500) ?? null, url: n.url });
    await sendPush(db, n);
  } catch (err) {
    console.error("[notifications]", err);
  }
}

/** Envoie à tous les appareils abonnés ; ceux qui se sont désabonnés (404/410) sont oubliés. */
export async function sendPush(db: Db, n: NewNotification): Promise<{ sent: number; removed: number }> {
  const cfg = pushConfig();
  if (!cfg) return { sent: 0, removed: 0 };
  const subs = await db.select().from(pushSubscriptions);
  const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url, tag: n.tag });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 6 * 3600,
          urgency: "high",
          vapidDetails: cfg,
        });
        sent++;
        await db.update(pushSubscriptions).set({ last_used_at: new Date() }).where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          removed++;
        } else {
          console.error("[push]", status ?? err);
        }
      }
    }),
  );
  return { sent, removed };
}

export async function listNotifications(db: Db, limit = 50) {
  return db.select().from(notifications).orderBy(desc(notifications.created_at)).limit(limit);
}

export async function countUnread(db: Db) {
  return db.$count(notifications, isNull(notifications.read_at));
}

export async function markAllRead(db: Db) {
  await db.update(notifications).set({ read_at: sql`now()` }).where(isNull(notifications.read_at));
}

export async function savePushSubscription(db: Db, sub: { endpoint: string; p256dh: string; auth: string }, device: string | null) {
  await db
    .insert(pushSubscriptions)
    .values({ ...sub, device })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: sub.p256dh, auth: sub.auth, device } });
}

export async function deletePushSubscription(db: Db, endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listDevices(db: Db) {
  return db
    .select({ id: pushSubscriptions.id, device: pushSubscriptions.device, created_at: pushSubscriptions.created_at, last_used_at: pushSubscriptions.last_used_at })
    .from(pushSubscriptions)
    .orderBy(desc(pushSubscriptions.created_at));
}
