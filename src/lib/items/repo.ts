import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemContext, ItemKind, ItemStatus, MailRule, PriorityLevel, Source, SourceKind } from "@/lib/db/types";
import { computePriority } from "@/lib/priority/score";

/** Récupère (ou crée) une source système : boîte mail, Microsoft, etc. */
export async function ensureSource(
  db: SupabaseClient,
  ownerId: string,
  s: { slug: string; name: string; kind: SourceKind; default_context: ItemContext },
): Promise<Source> {
  const { data, error } = await db
    .from("sources")
    .upsert({ owner_id: ownerId, ...s }, { onConflict: "owner_id,slug", ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw new Error(`ensureSource(${s.slug}) : ${error.message}`);
  return data as Source;
}

export async function markSourceSynced(db: SupabaseClient, sourceId: string, error: string | null) {
  await db
    .from("sources")
    .update({ last_sync_at: new Date().toISOString(), last_error: error })
    .eq("id", sourceId);
}

export interface IncomingItem {
  external_id: string;
  kind: ItemKind;
  title: string;
  context?: ItemContext;
  body?: string | null;
  url?: string | null;
  source_priority?: number | null;
  due_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  metadata?: Record<string, unknown>;
  /** Statut imposé par la source. Absent = on garde celui choisi par l'utilisateur. */
  status?: ItemStatus;
  /** Statut à la création uniquement. */
  initial_status?: ItemStatus;
}

/**
 * Upsert idempotent d'items venant d'une source.
 * Règle d'or : on ne réécrit JAMAIS ce que l'utilisateur a décidé
 * (statut, priorité manuelle, snooze) sauf si la source impose un statut.
 * Retourne la correspondance external_id → id.
 */
export async function upsertItems(
  db: SupabaseClient,
  ownerId: string,
  source: Pick<Source, "id" | "default_context">,
  incoming: IncomingItem[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (incoming.length === 0) return ids;
  // Une même source peut renvoyer deux fois le même élément dans un lot : on garde le dernier.
  incoming = [...new Map(incoming.map((c) => [c.external_id, c])).values()];

  for (let i = 0; i < incoming.length; i += 200) {
    const chunk = incoming.slice(i, i + 200);
    const { data: existing, error: selErr } = await db
      .from("items")
      .select("id, external_id")
      .eq("source_id", source.id)
      .in("external_id", chunk.map((c) => c.external_id));
    if (selErr) throw new Error(`upsertItems/select : ${selErr.message}`);

    const known = new Map((existing ?? []).map((r) => [r.external_id as string, r.id as string]));

    const toInsert = chunk
      .filter((c) => !known.has(c.external_id))
      .map((c) => ({
        owner_id: ownerId,
        source_id: source.id,
        external_id: c.external_id,
        kind: c.kind,
        context: c.context ?? source.default_context,
        status: c.status ?? c.initial_status ?? "inbox",
        title: c.title.slice(0, 500),
        body: c.body ?? null,
        url: c.url ?? null,
        source_priority: c.source_priority ?? null,
        due_at: c.due_at ?? null,
        starts_at: c.starts_at ?? null,
        ends_at: c.ends_at ?? null,
        metadata: c.metadata ?? {},
      }));

    if (toInsert.length) {
      const { data, error } = await db.from("items").insert(toInsert).select("id, external_id");
      if (error) throw new Error(`upsertItems/insert : ${error.message}`);
      for (const r of data ?? []) ids.set(r.external_id as string, r.id as string);
    }

    const updates = chunk.filter((c) => known.has(c.external_id));
    await Promise.all(
      updates.map(async (c) => {
        const id = known.get(c.external_id)!;
        ids.set(c.external_id, id);
        const patch: Record<string, unknown> = {
          title: c.title.slice(0, 500),
          body: c.body ?? null,
          url: c.url ?? null,
          source_priority: c.source_priority ?? null,
          due_at: c.due_at ?? null,
          starts_at: c.starts_at ?? null,
          ends_at: c.ends_at ?? null,
        };
        if (c.metadata) patch.metadata = c.metadata;
        if (c.context) patch.context = c.context;
        if (c.status) patch.status = c.status;
        const { error } = await db.from("items").update(patch).eq("id", id);
        if (error) throw new Error(`upsertItems/update : ${error.message}`);
      }),
    );
  }
  return ids;
}

const PRIORITY_COLUMNS =
  "id, kind, status, context, title, body, source_priority, manual_priority, due_at, starts_at, created_at, priority_score, priority_level, priority_reasons, email_messages(from_address, is_answered, is_bulk, received_at)";

// Forme d'une ligne lue avec PRIORITY_COLUMNS (Supabase renvoie l'embed en objet ou tableau).
interface PriorityRow {
  id: string;
  kind: ItemKind;
  status: ItemStatus;
  context: ItemContext;
  title: string;
  body: string | null;
  source_priority: number | null;
  manual_priority: PriorityLevel | null;
  due_at: string | null;
  starts_at: string | null;
  created_at: string;
  priority_score: number;
  priority_level: PriorityLevel;
  priority_reasons: string[];
  email_messages:
    | { from_address: string | null; is_answered: boolean; is_bulk: boolean; received_at: string }
    | { from_address: string | null; is_answered: boolean; is_bulk: boolean; received_at: string }[]
    | null;
}

function scoreRow(row: PriorityRow, rules: MailRule[], now: Date) {
  const email = Array.isArray(row.email_messages) ? row.email_messages[0] : row.email_messages;
  return computePriority(
    {
      kind: row.kind,
      status: row.status,
      context: row.context,
      title: row.title,
      body: row.body,
      sourcePriority: row.source_priority,
      manualPriority: row.manual_priority,
      dueAt: row.due_at,
      startsAt: row.starts_at,
      createdAt: row.created_at,
      email: email
        ? { fromAddress: email.from_address, isAnswered: email.is_answered, isBulk: email.is_bulk, receivedAt: email.received_at }
        : null,
    },
    { now, rules },
  );
}

/**
 * Recalcule le score de tous les items ouverts (le temps qui passe change
 * les priorités : une échéance à J+2 devient J+0). N'écrit que ce qui change.
 */
export async function recomputePriorities(db: SupabaseClient, ownerId: string, now = new Date()) {
  const [{ data, error }, { data: rules }] = await Promise.all([
    db.from("items").select(PRIORITY_COLUMNS).eq("owner_id", ownerId).not("status", "in", "(done,archived)"),
    db.from("mail_rules").select("*").eq("owner_id", ownerId),
  ]);
  if (error) throw new Error(`recomputePriorities : ${error.message}`);
  const rows = (data ?? []) as unknown as PriorityRow[];

  const changed = rows
    .map((row) => ({ row, r: scoreRow(row, (rules ?? []) as MailRule[], now) }))
    .filter(
      ({ row, r }) =>
        r.score !== row.priority_score ||
        r.level !== row.priority_level ||
        JSON.stringify(r.reasons) !== JSON.stringify(row.priority_reasons),
    );

  for (let i = 0; i < changed.length; i += 25) {
    await Promise.all(
      changed.slice(i, i + 25).map(({ row, r }) =>
        db
          .from("items")
          .update({ priority_score: r.score, priority_level: r.level, priority_reasons: r.reasons })
          .eq("id", row.id),
      ),
    );
  }
  return { scanned: rows.length, updated: changed.length };
}

/** Recalcule un seul item (après une action utilisateur). */
export async function recomputeOne(db: SupabaseClient, ownerId: string, itemId: string) {
  const [{ data }, { data: rules }] = await Promise.all([
    db.from("items").select(PRIORITY_COLUMNS).eq("id", itemId).eq("owner_id", ownerId).maybeSingle(),
    db.from("mail_rules").select("*").eq("owner_id", ownerId),
  ]);
  if (!data) return;
  const r = scoreRow(data as unknown as PriorityRow, (rules ?? []) as MailRule[], new Date());
  await db
    .from("items")
    .update({ priority_score: r.score, priority_level: r.level, priority_reasons: r.reasons })
    .eq("id", itemId);
}
