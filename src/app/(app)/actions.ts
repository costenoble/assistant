"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { isUniqueViolation } from "@/lib/db";
import { clients, items, mailRules, sources } from "@/lib/db/schema";
import { findClientByRef } from "@/lib/clients/link";
import { ITEM_CONTEXTS, ITEM_STATUSES, PRIORITY_LEVELS, RULE_ACTIONS, RULE_MATCHES } from "@/lib/db/types";
import { recomputeOne } from "@/lib/items/repo";
import { parseQuickAdd } from "@/lib/quick-add/parse";
import { runFullSync } from "@/lib/sync/run";
import { fromParis, parisParts } from "@/lib/time/paris";
import { generateApiKey } from "@/lib/ingest/keys";
import { disconnectMicrosoft } from "@/lib/microsoft/oauth";

const id = z.uuid();

function refresh() {
  revalidatePath("/", "layout");
}

export async function quickAdd(formData: FormData) {
  const raw = z.string().trim().min(1).max(500).safeParse(formData.get("text"));
  if (!raw.success) return;
  const { db } = await requireOwner();
  const p = parseQuickAdd(raw.data);
  // Client : celui de la fiche d'où l'on saisit, sinon « @slug » dans le texte.
  const fromForm = id.safeParse(formData.get("client_id"));
  const clientId = fromForm.success ? fromForm.data : p.clientRef ? await findClientByRef(db, p.clientRef) : null;
  const [created] = await db
    .insert(items)
    .values({
      kind: "task",
      status: "todo",
      client_id: clientId,
      // « @inconnu » n'est pas avalé en silence : il reste dans le titre.
      title: p.clientRef && !clientId ? `${p.title} @${p.clientRef}` : p.title,
      context: p.context ?? "perso",
      manual_priority: p.manualPriority ?? null,
      due_at: p.dueAt ?? null,
    })
    .returning({ id: items.id });
  if (created) await recomputeOne(db, created.id);
  refresh();
}

export async function setStatus(itemId: string, status: (typeof ITEM_STATUSES)[number]) {
  const { db } = await requireOwner();
  await db.update(items).set({ status: z.enum(ITEM_STATUSES).parse(status) }).where(eq(items.id, id.parse(itemId)));
  await recomputeOne(db, itemId);
  refresh();
}

export async function setPriority(itemId: string, level: (typeof PRIORITY_LEVELS)[number] | null) {
  const { db } = await requireOwner();
  await db
    .update(items)
    .set({ manual_priority: level === null ? null : z.enum(PRIORITY_LEVELS).parse(level) })
    .where(eq(items.id, id.parse(itemId)));
  await recomputeOne(db, itemId);
  refresh();
}

export async function setContext(itemId: string, context: (typeof ITEM_CONTEXTS)[number]) {
  const { db } = await requireOwner();
  await db.update(items).set({ context: z.enum(ITEM_CONTEXTS).parse(context) }).where(eq(items.id, id.parse(itemId)));
  refresh();
}

/** Rattache un item à un client (ou le détache avec null). */
export async function setItemClient(itemId: string, clientId: string | null) {
  const { db } = await requireOwner();
  const target = clientId === null ? null : id.parse(clientId);
  if (target) {
    const [exists] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, target));
    if (!exists) return;
  }
  await db.update(items).set({ client_id: target }).where(eq(items.id, id.parse(itemId)));
  refresh();
}

/** Reporter : demain 9h, ou lundi prochain 9h. */
export async function snooze(itemId: string, until: "tomorrow" | "monday") {
  const { db } = await requireOwner();
  const p = parisParts(new Date());
  const offset = until === "tomorrow" ? 1 : ((1 - p.weekday + 7) % 7) || 7;
  const date = fromParis(p.year, p.month, p.day + offset, 9, 0);
  await db.update(items).set({ snoozed_until: date }).where(eq(items.id, id.parse(itemId)));
  refresh();
}

/** Un mail qui demande du travail devient une tâche. */
export async function emailToTask(itemId: string) {
  const { db } = await requireOwner();
  await db
    .update(items)
    .set({ kind: "task", status: "todo" })
    .where(and(eq(items.id, id.parse(itemId)), eq(items.kind, "email")));
  await recomputeOne(db, itemId);
  refresh();
}

export async function syncNow() {
  await requireOwner();
  await runFullSync();
  refresh();
}

// ─── Réglages ───────────────────────────────────────────────────────

export type CreateSourceState = { key?: string; error?: string } | null;

export async function createSaasSource(_prev: CreateSourceState, formData: FormData): Promise<CreateSourceState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "slug : minuscules, chiffres, tirets"),
      context: z.enum(ITEM_CONTEXTS),
    })
    .safeParse({ name: formData.get("name"), slug: formData.get("slug"), context: formData.get("context") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const { key, hash, hint } = generateApiKey(parsed.data.slug);
  try {
    await db.insert(sources).values({
      slug: parsed.data.slug,
      name: parsed.data.name,
      kind: "saas",
      default_context: parsed.data.context,
      api_key_hash: hash,
      api_key_hint: hint,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Ce slug existe déjà." };
    throw err;
  }
  refresh();
  return { key };
}

export async function rotateSourceKey(sourceId: string): Promise<string> {
  const { db } = await requireOwner();
  const [src] = await db.select({ slug: sources.slug }).from(sources).where(eq(sources.id, id.parse(sourceId)));
  if (!src) throw new Error("Source introuvable");
  const { key, hash, hint } = generateApiKey(src.slug);
  await db.update(sources).set({ api_key_hash: hash, api_key_hint: hint }).where(eq(sources.id, sourceId));
  refresh();
  return key;
}

export async function toggleSource(sourceId: string, active: boolean) {
  const { db } = await requireOwner();
  await db.update(sources).set({ active: z.boolean().parse(active) }).where(eq(sources.id, id.parse(sourceId)));
  refresh();
}

export async function addMailRule(formData: FormData) {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      match_type: z.enum(RULE_MATCHES),
      pattern: z.string().trim().min(2).max(200),
      context: z.enum(ITEM_CONTEXTS).or(z.literal("")).transform((v) => v || null),
      action: z.enum(RULE_ACTIONS),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await db.insert(mailRules).values(parsed.data);
  refresh();
}

export async function deleteMailRule(ruleId: string) {
  const { db } = await requireOwner();
  await db.delete(mailRules).where(eq(mailRules.id, id.parse(ruleId)));
  refresh();
}

export async function disconnectMs() {
  const { db } = await requireOwner();
  await disconnectMicrosoft(db);
  refresh();
}
