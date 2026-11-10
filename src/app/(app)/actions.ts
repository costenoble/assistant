"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { ITEM_CONTEXTS, ITEM_STATUSES, PRIORITY_LEVELS } from "@/lib/db/types";
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
  const { supabase, user } = await requireOwner();
  const p = parseQuickAdd(raw.data);
  const { data } = await supabase
    .from("items")
    .insert({
      owner_id: user.id,
      kind: "task",
      status: "todo",
      title: p.title,
      context: p.context ?? "perso",
      manual_priority: p.manualPriority ?? null,
      due_at: p.dueAt?.toISOString() ?? null,
    })
    .select("id")
    .single();
  if (data) await recomputeOne(supabase, user.id, data.id);
  refresh();
}

export async function setStatus(itemId: string, status: (typeof ITEM_STATUSES)[number]) {
  const { supabase, user } = await requireOwner();
  await supabase.from("items").update({ status: z.enum(ITEM_STATUSES).parse(status) }).eq("id", id.parse(itemId));
  await recomputeOne(supabase, user.id, itemId);
  refresh();
}

export async function setPriority(itemId: string, level: (typeof PRIORITY_LEVELS)[number] | null) {
  const { supabase, user } = await requireOwner();
  await supabase
    .from("items")
    .update({ manual_priority: level === null ? null : z.enum(PRIORITY_LEVELS).parse(level) })
    .eq("id", id.parse(itemId));
  await recomputeOne(supabase, user.id, itemId);
  refresh();
}

export async function setContext(itemId: string, context: (typeof ITEM_CONTEXTS)[number]) {
  const { supabase } = await requireOwner();
  await supabase.from("items").update({ context: z.enum(ITEM_CONTEXTS).parse(context) }).eq("id", id.parse(itemId));
  refresh();
}

/** Reporter : demain 9h, ou lundi prochain 9h. */
export async function snooze(itemId: string, until: "tomorrow" | "monday") {
  const { supabase } = await requireOwner();
  const p = parisParts(new Date());
  const offset = until === "tomorrow" ? 1 : ((1 - p.weekday + 7) % 7) || 7;
  const date = fromParis(p.year, p.month, p.day + offset, 9, 0);
  await supabase.from("items").update({ snoozed_until: date.toISOString() }).eq("id", id.parse(itemId));
  refresh();
}

/** Un mail qui demande du travail devient une tâche (avec échéance optionnelle). */
export async function emailToTask(itemId: string) {
  const { supabase, user } = await requireOwner();
  await supabase.from("items").update({ kind: "task", status: "todo" }).eq("id", id.parse(itemId)).eq("kind", "email");
  await recomputeOne(supabase, user.id, itemId);
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
  const { supabase, user } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "slug : minuscules, chiffres, tirets"),
      context: z.enum(ITEM_CONTEXTS),
    })
    .safeParse({ name: formData.get("name"), slug: formData.get("slug"), context: formData.get("context") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const { key, hash, hint } = generateApiKey(parsed.data.slug);
  const { error } = await supabase.from("sources").insert({
    owner_id: user.id,
    slug: parsed.data.slug,
    name: parsed.data.name,
    kind: "saas",
    default_context: parsed.data.context,
    api_key_hash: hash,
    api_key_hint: hint,
  });
  if (error) return { error: error.code === "23505" ? "Ce slug existe déjà." : error.message };
  refresh();
  return { key };
}

export async function rotateSourceKey(sourceId: string): Promise<string> {
  const { supabase } = await requireOwner();
  const { data: src } = await supabase.from("sources").select("slug").eq("id", id.parse(sourceId)).single();
  if (!src) throw new Error("Source introuvable");
  const { key, hash, hint } = generateApiKey(src.slug);
  await supabase.from("sources").update({ api_key_hash: hash, api_key_hint: hint }).eq("id", sourceId);
  refresh();
  return key;
}

export async function toggleSource(sourceId: string, active: boolean) {
  const { supabase } = await requireOwner();
  await supabase.from("sources").update({ active }).eq("id", id.parse(sourceId));
  refresh();
}

export async function addMailRule(formData: FormData) {
  const { supabase, user } = await requireOwner();
  const parsed = z
    .object({
      match_type: z.enum(["from_domain", "from_address", "subject_contains"]),
      pattern: z.string().trim().min(2).max(200),
      context: z.enum(ITEM_CONTEXTS).or(z.literal("")).transform((v) => v || null),
      action: z.enum(["vip", "ignore", "none"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await supabase.from("mail_rules").insert({ owner_id: user.id, ...parsed.data });
  refresh();
}

export async function deleteMailRule(ruleId: string) {
  const { supabase } = await requireOwner();
  await supabase.from("mail_rules").delete().eq("id", id.parse(ruleId));
  refresh();
}

export async function disconnectMs() {
  await requireOwner();
  await disconnectMicrosoft(createAdminClient());
  refresh();
}
