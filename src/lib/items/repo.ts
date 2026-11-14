import "server-only";
import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailMessages, items, mailRules, sources, tickets } from "@/lib/db/schema";
import type { ItemContext, ItemKind, ItemStatus, Source, SourceKind } from "@/lib/db/types";
import { computePriority } from "@/lib/priority/score";

const CLOSED: ItemStatus[] = ["done", "archived"];

/** Récupère (ou crée) une source système : boîte mail, Microsoft, etc. */
export async function ensureSource(
  db: Db,
  s: { slug: string; name: string; kind: SourceKind; default_context: ItemContext },
): Promise<Source> {
  const [row] = await db
    .insert(sources)
    .values(s)
    .onConflictDoUpdate({ target: sources.slug, set: { name: s.name, kind: s.kind, default_context: s.default_context } })
    .returning();
  if (!row) throw new Error(`ensureSource(${s.slug}) : aucune ligne renvoyée`);
  return row;
}

export async function markSourceSynced(db: Db, sourceId: string, error: string | null) {
  await db.update(sources).set({ last_sync_at: new Date(), last_error: error }).where(eq(sources.id, sourceId));
}

type DateInput = string | Date | null;

export interface IncomingItem {
  external_id: string;
  kind: ItemKind;
  title: string;
  context?: ItemContext;
  body?: string | null;
  url?: string | null;
  source_priority?: number | null;
  due_at?: DateInput;
  starts_at?: DateInput;
  ends_at?: DateInput;
  metadata?: Record<string, unknown>;
  /** Statut imposé par la source. Absent = on garde celui choisi par l'utilisateur. */
  status?: ItemStatus;
  /** Statut à la création uniquement. */
  initial_status?: ItemStatus;
}

const toDate = (v: DateInput | undefined) => (v == null ? null : new Date(v));

/** Égalité de valeurs de colonnes (dates comparées par instant, JSON par contenu). */
function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Upsert idempotent d'items venant d'une source.
 * Règle d'or : on ne réécrit JAMAIS ce que l'utilisateur a décidé
 * (statut, priorité manuelle, snooze) sauf si la source impose un statut.
 * Mise à jour partielle : un champ absent (undefined) est conservé, null l'efface.
 * Retourne la correspondance external_id → id.
 */
export async function upsertItems(
  db: Db,
  source: Pick<Source, "id" | "default_context">,
  incoming: IncomingItem[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (incoming.length === 0) return ids;
  // Une même source peut renvoyer deux fois le même élément dans un lot : on garde le dernier.
  incoming = [...new Map(incoming.map((c) => [c.external_id, c])).values()];

  for (let i = 0; i < incoming.length; i += 500) {
    const chunk = incoming.slice(i, i + 500);
    const findExisting = (externalIds: string[]) =>
      db
        .select()
        .from(items)
        .where(and(eq(items.source_id, source.id), inArray(items.external_id, externalIds)));

    const existing = await findExisting(chunk.map((c) => c.external_id));
    const known = new Map(existing.map((r) => [r.external_id!, r]));

    const toInsert = chunk.filter((c) => !known.has(c.external_id));
    if (toInsert.length) {
      // onConflictDoNothing : deux synchros simultanées ne font pas échouer le lot.
      const inserted = await db
        .insert(items)
        .values(
          toInsert.map((c) => ({
            source_id: source.id,
            external_id: c.external_id,
            kind: c.kind,
            context: c.context ?? source.default_context,
            status: c.status ?? c.initial_status ?? "inbox",
            title: c.title.slice(0, 500),
            body: c.body ?? null,
            url: c.url ?? null,
            source_priority: c.source_priority ?? null,
            due_at: toDate(c.due_at),
            starts_at: toDate(c.starts_at),
            ends_at: toDate(c.ends_at),
            metadata: c.metadata ?? {},
          })),
        )
        .onConflictDoNothing({ target: [items.source_id, items.external_id] })
        .returning({ id: items.id, external_id: items.external_id });
      for (const r of inserted) ids.set(r.external_id!, r.id);

      const lost = toInsert.filter((c) => !ids.has(c.external_id)).map((c) => c.external_id);
      if (lost.length) for (const r of await findExisting(lost)) ids.set(r.external_id!, r.id);
    }

    for (const c of chunk) {
      const row = known.get(c.external_id);
      if (!row) continue;
      ids.set(c.external_id, row.id);

      const wanted: Partial<typeof items.$inferInsert> = { title: c.title.slice(0, 500) };
      if (c.body !== undefined) wanted.body = c.body;
      if (c.url !== undefined) wanted.url = c.url;
      if (c.source_priority !== undefined) wanted.source_priority = c.source_priority;
      if (c.due_at !== undefined) wanted.due_at = toDate(c.due_at);
      if (c.starts_at !== undefined) wanted.starts_at = toDate(c.starts_at);
      if (c.ends_at !== undefined) wanted.ends_at = toDate(c.ends_at);
      if (c.metadata) wanted.metadata = c.metadata;
      if (c.context) wanted.context = c.context;
      if (c.status) wanted.status = c.status;

      // On n'écrit que ce qui a changé : une synchro sans nouveauté ne touche pas la base.
      const patch = Object.fromEntries(
        Object.entries(wanted).filter(([k, v]) => !same(v, row[k as keyof typeof row])),
      );
      if (Object.keys(patch).length) await db.update(items).set(patch).where(eq(items.id, row.id));
    }
  }
  return ids;
}

const priorityColumns = {
  id: items.id,
  kind: items.kind,
  status: items.status,
  context: items.context,
  title: items.title,
  body: items.body,
  source_priority: items.source_priority,
  manual_priority: items.manual_priority,
  due_at: items.due_at,
  starts_at: items.starts_at,
  created_at: items.created_at,
  priority_score: items.priority_score,
  priority_level: items.priority_level,
  priority_reasons: items.priority_reasons,
  email: {
    from_address: emailMessages.from_address,
    is_answered: emailMessages.is_answered,
    is_bulk: emailMessages.is_bulk,
    received_at: emailMessages.received_at,
  },
  ticket: {
    urgent: tickets.urgent,
    last_client_message_at: tickets.last_client_message_at,
  },
};

function priorityRows(db: Db) {
  return db
    .select(priorityColumns)
    .from(items)
    .leftJoin(emailMessages, eq(emailMessages.item_id, items.id))
    .leftJoin(tickets, eq(tickets.item_id, items.id));
}
type PriorityRow = Awaited<ReturnType<typeof priorityRows>>[number];

function scoreRow(row: PriorityRow, rules: (typeof mailRules.$inferSelect)[], now: Date) {
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
      email: row.email
        ? {
            fromAddress: row.email.from_address,
            isAnswered: row.email.is_answered,
            isBulk: row.email.is_bulk,
            receivedAt: row.email.received_at,
          }
        : null,
      ticket: row.ticket
        ? { urgent: row.ticket.urgent, lastClientMessageAt: row.ticket.last_client_message_at }
        : null,
    },
    { now, rules },
  );
}

/**
 * Recalcule le score de tous les items ouverts (le temps qui passe change
 * les priorités : une échéance à J+2 devient J+0). N'écrit que ce qui change.
 */
export async function recomputePriorities(db: Db, now = new Date()) {
  const [rows, rules] = await Promise.all([
    priorityRows(db).where(notInArray(items.status, CLOSED)),
    db.select().from(mailRules),
  ]);

  const changed = rows
    .map((row) => ({ row, r: scoreRow(row, rules, now) }))
    .filter(
      ({ row, r }) =>
        r.score !== row.priority_score ||
        r.level !== row.priority_level ||
        JSON.stringify(r.reasons) !== JSON.stringify(row.priority_reasons),
    );

  for (const { row, r } of changed) {
    await db
      .update(items)
      .set({ priority_score: r.score, priority_level: r.level, priority_reasons: r.reasons })
      .where(eq(items.id, row.id));
  }
  return { scanned: rows.length, updated: changed.length };
}

/**
 * Clôt les RDV terminés depuis plus de 24 h (toutes sources) : ils n'ont plus
 * rien à faire dans le flux ouvert. On garde la veille pour l'agenda du jour.
 */
export async function closePastEvents(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 3_600_000);
  const closed = await db
    .update(items)
    .set({ status: "archived" })
    .where(and(eq(items.kind, "event"), notInArray(items.status, CLOSED), lt(items.ends_at, cutoff)))
    .returning({ id: items.id });
  return closed.length;
}

/** Recalcule un seul item (après une action utilisateur). */
export async function recomputeOne(db: Db, itemId: string) {
  const [[row], rules] = await Promise.all([
    priorityRows(db).where(eq(items.id, itemId)),
    db.select().from(mailRules),
  ]);
  if (!row) return;
  const r = scoreRow(row, rules, new Date());
  await db
    .update(items)
    .set({ priority_score: r.score, priority_level: r.level, priority_reasons: r.reasons })
    .where(eq(items.id, itemId));
}
