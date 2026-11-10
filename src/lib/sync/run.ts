import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, mailAccounts, mailInitialSyncDays, microsoftConfig } from "@/lib/env";
import { syncMailAccount } from "@/lib/mail/imap-sync";
import { syncMicrosoft } from "@/lib/microsoft/graph-sync";
import { recomputePriorities } from "@/lib/items/repo";

/**
 * Orchestrateur : synchronise chaque connecteur indépendamment (une panne
 * IMAP ne bloque pas Outlook), puis recalcule toutes les priorités.
 */
export async function runFullSync() {
  const db = createAdminClient();
  const ownerId = env().OWNER_USER_ID;
  const started = Date.now();
  const results: Record<string, unknown> = {};

  const jobs: Promise<void>[] = [];

  for (const account of mailAccounts()) {
    jobs.push(
      syncMailAccount(db, ownerId, account, { initialDays: mailInitialSyncDays() })
        .then((r) => void (results[`mail:${account.id}`] = r))
        .catch((e: unknown) => void (results[`mail:${account.id}`] = { error: String(e) })),
    );
  }

  if (microsoftConfig()) {
    jobs.push(
      syncMicrosoft(db, ownerId)
        .then((r) => void (results.microsoft = r))
        .catch((e: unknown) => void (results.microsoft = { error: String(e) })),
    );
  }

  await Promise.all(jobs);
  try {
    results.priorities = await recomputePriorities(db, ownerId);
  } catch (e) {
    results.priorities = { error: String(e) };
  }
  return { durationMs: Date.now() - started, results };
}
