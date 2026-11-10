import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailMessages, items, sources } from "@/lib/db/schema";
import type { ItemContext, ItemStatus, ItemWithEmail } from "@/lib/db/types";
import { parisDayBounds } from "@/lib/time/paris";

const ACTIVE: ItemStatus[] = ["inbox", "todo", "in_progress"];
const TASK_KINDS = ["task", "followup"] as const;

/** Items + détail du mail associé (1-1, absent pour les tâches et RDV). */
function withEmail(db: Db, where: SQL | undefined) {
  return db
    .select({ item: items, email: emailMessages })
    .from(items)
    .leftJoin(emailMessages, eq(emailMessages.item_id, items.id))
    .where(where)
    .$dynamic();
}

const flatten = (rows: { item: typeof items.$inferSelect; email: typeof emailMessages.$inferSelect | null }[]) =>
  rows.map((r): ItemWithEmail => ({ ...r.item, email_messages: r.email }));

const notSnoozed = (now: Date) => or(isNull(items.snoozed_until), lte(items.snoozed_until, now));

export async function getTodayData(db: Db, now = new Date()) {
  const today = parisDayBounds(now);
  const tomorrow = parisDayBounds(now, 1);
  const eventsBetween = (start: Date, end: Date) =>
    db
      .select()
      .from(items)
      .where(and(eq(items.kind, "event"), ne(items.status, "archived"), gte(items.starts_at, start), lt(items.starts_at, end)))
      .orderBy(asc(items.starts_at));

  const [focus, emails, events, tomorrowEvents, waitingCount, overdueCount] = await Promise.all([
    // À faire maintenant : tâches/suivis ouverts, triés par score.
    withEmail(db, and(inArray(items.kind, TASK_KINDS), inArray(items.status, ACTIVE), notSnoozed(now)))
      .orderBy(desc(items.priority_score), asc(items.due_at))
      .limit(12),
    // Mails à traiter (hors newsletters).
    withEmail(db, and(eq(items.kind, "email"), eq(items.status, "inbox"), notSnoozed(now), gte(items.priority_score, 20)))
      .orderBy(desc(items.priority_score))
      .limit(8),
    eventsBetween(today.start, today.end),
    eventsBetween(tomorrow.start, tomorrow.end),
    db.$count(items, eq(items.status, "waiting")),
    db.$count(items, and(inArray(items.status, ACTIVE), lt(items.due_at, now))),
  ]);

  return { focus: flatten(focus), emails: flatten(emails), events, tomorrowEvents, waitingCount, overdueCount };
}

export async function getInbox(db: Db, opts: { showBulk: boolean }, now = new Date()) {
  const rows = await withEmail(
    db,
    and(
      eq(items.kind, "email"),
      eq(items.status, "inbox"),
      notSnoozed(now),
      opts.showBulk ? undefined : gte(items.priority_score, 1),
    ),
  )
    .orderBy(desc(items.priority_score))
    .limit(100);
  return flatten(rows);
}

export async function getTasks(db: Db, filter: { context?: ItemContext; status: "open" | "waiting" | "done" }) {
  const status =
    filter.status === "open"
      ? inArray(items.status, ACTIVE)
      : filter.status === "waiting"
        ? eq(items.status, "waiting")
        : eq(items.status, "done");
  const rows = await withEmail(
    db,
    and(inArray(items.kind, TASK_KINDS), status, filter.context ? eq(items.context, filter.context) : undefined),
  )
    .orderBy(...(filter.status === "done" ? [desc(items.completed_at)] : [desc(items.priority_score)]))
    .limit(200);
  return flatten(rows);
}

export async function getNavCounts(db: Db, now = new Date()) {
  const [inbox, urgentTasks] = await Promise.all([
    db.$count(items, and(eq(items.kind, "email"), eq(items.status, "inbox"), gte(items.priority_score, 20), notSnoozed(now))),
    db.$count(
      items,
      and(inArray(items.kind, TASK_KINDS), inArray(items.status, ACTIVE), inArray(items.priority_level, ["critical", "high"])),
    ),
  ]);
  return { inbox, urgentTasks };
}

export async function getSources(db: Db) {
  return db.select().from(sources).orderBy(asc(sources.created_at));
}
