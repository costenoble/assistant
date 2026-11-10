import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemContext, ItemKind, ItemStatus, MailRule, PriorityLevel, Source, SourceKind } from "@/lib/db/types";
import { computePriority } from "@/lib/priority/score";

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Lit toutes les lignes d'une requête, page par page : l'API Supabase plafonne
 * chaque réponse (1000 lignes par défaut) sans le signaler. La requête doit
 * avoir un ordre stable (ex. `.order("id")`).
 */
export async function selectAll<T>(page: (from: number, to: number) => Page<T>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

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

  // Lots de 40 : les ids Graph font ~150 caractères et partent dans l'URL (`in.(…)`).
  for (let i = 0; i < incoming.length; i += 40) {
    const chunk = incoming.slice(i, i + 40);
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
        // Mise à jour partielle : un champ absent (undefined) est conservé, null l'efface.
        const patch: Record<string, unknown> = { title: c.title.slice(0, 500) };
        for (const field of ["body", "url", "source_priority", "due_at", "starts_at", "ends_at"] as const) {
          if (c[field] !== undefined) patch[field] = c[field];
        }
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
  const [rows, { data: rules }] = await Promise.all([
    selectAll<PriorityRow>((a, b) =>
      db
        .from("items")
        .select(PRIORITY_COLUMNS)
        .eq("owner_id", ownerId)
        .not("status", "in", "(done,archived)")
        .order("id")
        .range(a, b) as unknown as Page<PriorityRow>,
    ).catch((e: unknown) => {
      throw new Error(`recomputePriorities : ${e instanceof Error ? e.message : String(e)}`);
    }),
    db.from("mail_rules").select("*").eq("owner_id", ownerId),
  ]);

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

/**
 * Clôt les RDV terminés depuis plus de 24 h (toutes sources) : ils n'ont plus
 * rien à faire dans le flux ouvert. On garde la veille pour l'agenda du jour.
 */
export async function closePastEvents(db: SupabaseClient, ownerId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { data, error } = await db
    .from("items")
    .update({ status: "archived" })
    .eq("owner_id", ownerId)
    .eq("kind", "event")
    .not("status", "in", "(done,archived)")
    .lt("ends_at", cutoff)
    .select("id");
  if (error) throw new Error(`closePastEvents : ${error.message}`);
  return data?.length ?? 0;
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
