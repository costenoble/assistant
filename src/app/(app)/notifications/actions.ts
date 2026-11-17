"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { deletePushSubscription, markAllRead, savePushSubscription, sendPush } from "@/lib/notifications/service";

const subscription = z.object({
  endpoint: z.url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Abonne cet appareil aux notifications. */
export async function subscribePushAction(sub: unknown, device: string | null) {
  const { db } = await requireOwner();
  const parsed = subscription.parse(sub);
  await savePushSubscription(db, { endpoint: parsed.endpoint, p256dh: parsed.keys.p256dh, auth: parsed.keys.auth }, device?.slice(0, 80) ?? null);
  revalidatePath("/reglages");
}

export async function unsubscribePushAction(endpoint: string) {
  const { db } = await requireOwner();
  await deletePushSubscription(db, z.url().parse(endpoint));
  revalidatePath("/reglages");
}

export async function sendTestPushAction() {
  const { db } = await requireOwner();
  return sendPush(db, { kind: "test", title: "Cockpit est bien branché", body: "Tu recevras ici les tâches de tes clients et les mails urgents.", url: "/notifications", tag: "test" });
}

export async function markAllReadAction() {
  const { db } = await requireOwner();
  await markAllRead(db);
  revalidatePath("/", "layout");
}
