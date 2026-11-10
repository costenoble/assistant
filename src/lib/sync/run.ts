import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { mailAccounts, mailInitialSyncDays, microsoftConfig } from "@/lib/env";
import { syncMailAccount } from "@/lib/mail/imap-sync";
import { MICROSOFT_SOURCE_SLUG, syncMicrosoft } from "@/lib/microsoft/graph-sync";
import { closePastEvents, recomputePriorities } from "@/lib/items/repo";

/**
 * Orchestrateur : synchronise chaque connecteur indépendamment (une panne
 * IMAP ne bloque pas Outlook), puis recalcule toutes les priorités.
 */
export async function runFullSync() {
  const db = getDb();
  const started = Date.now();
  const results: Record<string, unknown> = {};

  const jobs: Promise<void>[] = [];

  // Sources désactivées dans les Réglages : on ne les synchronise pas.
  const inactive = await db.select({ slug: sources.slug }).from(sources).where(eq(sources.active, false));
  const disabled = new Set(inactive.map((s) => s.slug));

  for (const account of mailAccounts()) {
    if (disabled.has(`mail-${account.id}`)) {
      results[`mail:${account.id}`] = { skipped: "désactivée" };
      continue;
    }
    jobs.push(
      syncMailAccount(db, account, { initialDays: mailInitialSyncDays() })
        .then((r) => void (results[`mail:${account.id}`] = r))
        .catch((e: unknown) => void (results[`mail:${account.id}`] = { error: String(e) })),
    );
  }

  if (microsoftConfig() && disabled.has(MICROSOFT_SOURCE_SLUG)) {
    results.microsoft = { skipped: "désactivée" };
  } else if (microsoftConfig()) {
    jobs.push(
      syncMicrosoft(db)
        .then((r) => void (results.microsoft = r))
        .catch((e: unknown) => void (results.microsoft = { error: String(e) })),
    );
  }

  await Promise.all(jobs);
  try {
    results.closedEvents = await closePastEvents(db);
  } catch (e) {
    results.closedEvents = { error: String(e) };
  }
  try {
    results.priorities = await recomputePriorities(db);
  } catch (e) {
    results.priorities = { error: String(e) };
  }
  return { durationMs: Date.now() - started, results };
}
