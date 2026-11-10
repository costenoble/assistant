import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item, ItemContext, ItemWithEmail, Source } from "@/lib/db/types";
import { parisDayBounds } from "@/lib/time/paris";

const WITH_EMAIL = "*, email_messages(*)";

/** Normalise l'embed 1-1 (Supabase peut le renvoyer en tableau). */
function normalize(rows: unknown[] | null): ItemWithEmail[] {
  return (rows ?? []).map((r) => {
    const row = r as Item & { email_messages: unknown };
    const e = Array.isArray(row.email_messages) ? row.email_messages[0] : row.email_messages;
    return { ...row, email_messages: (e ?? null) as ItemWithEmail["email_messages"] };
  });
}

const notSnoozed = (now: Date) => `snoozed_until.is.null,snoozed_until.lte.${now.toISOString()}`;

export async function getTodayData(db: SupabaseClient, now = new Date()) {
  const today = parisDayBounds(now);
  const tomorrow = parisDayBounds(now, 1);

  const [focus, emails, events, tomorrowEvents, waiting, overdueCount] = await Promise.all([
    // À faire maintenant : tâches/suivis ouverts, triés par score.
    db
      .from("items")
      .select(WITH_EMAIL)
      .in("kind", ["task", "followup"])
      .in("status", ["inbox", "todo", "in_progress"])
      .or(notSnoozed(now))
      .order("priority_score", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(12),
    // Mails à traiter (hors newsletters).
    db
      .from("items")
      .select(WITH_EMAIL)
      .eq("kind", "email")
      .eq("status", "inbox")
      .or(notSnoozed(now))
      .gte("priority_score", 20)
      .order("priority_score", { ascending: false })
      .limit(8),
    db
      .from("items")
      .select("*")
      .eq("kind", "event")
      .neq("status", "archived")
      .gte("starts_at", today.start.toISOString())
      .lt("starts_at", today.end.toISOString())
      .order("starts_at"),
    db
      .from("items")
      .select("*")
      .eq("kind", "event")
      .neq("status", "archived")
      .gte("starts_at", tomorrow.start.toISOString())
      .lt("starts_at", tomorrow.end.toISOString())
      .order("starts_at"),
    db.from("items").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    db
      .from("items")
      .select("id", { count: "exact", head: true })
      .in("status", ["inbox", "todo", "in_progress"])
      .lt("due_at", now.toISOString()),
  ]);

  return {
    focus: normalize(focus.data),
    emails: normalize(emails.data),
    events: (events.data ?? []) as Item[],
    tomorrowEvents: (tomorrowEvents.data ?? []) as Item[],
    waitingCount: waiting.count ?? 0,
    overdueCount: overdueCount.count ?? 0,
  };
}

export async function getInbox(db: SupabaseClient, opts: { showBulk: boolean }, now = new Date()) {
  let q = db
    .from("items")
    .select(WITH_EMAIL)
    .eq("kind", "email")
    .eq("status", "inbox")
    .or(notSnoozed(now))
    .order("priority_score", { ascending: false })
    .limit(100);
  if (!opts.showBulk) q = q.gte("priority_score", 1);
  const { data } = await q;
  return normalize(data);
}

export async function getTasks(db: SupabaseClient, filter: { context?: ItemContext; status: "open" | "waiting" | "done" }) {
  let q = db.from("items").select(WITH_EMAIL).in("kind", ["task", "followup"]);
  if (filter.status === "open") q = q.in("status", ["inbox", "todo", "in_progress"]);
  else if (filter.status === "waiting") q = q.eq("status", "waiting");
  else q = q.eq("status", "done").order("completed_at", { ascending: false });
  if (filter.context) q = q.eq("context", filter.context);
  const { data } = await q.order("priority_score", { ascending: false }).limit(200);
  return normalize(data);
}

export async function getNavCounts(db: SupabaseClient, now = new Date()) {
  const [inbox, tasks] = await Promise.all([
    db.from("items").select("id", { count: "exact", head: true }).eq("kind", "email").eq("status", "inbox").gte("priority_score", 20).or(notSnoozed(now)),
    db.from("items").select("id", { count: "exact", head: true }).in("kind", ["task", "followup"]).in("status", ["inbox", "todo", "in_progress"]).in("priority_level", ["critical", "high"]),
  ]);
  return { inbox: inbox.count ?? 0, urgentTasks: tasks.count ?? 0 };
}

export async function getSources(db: SupabaseClient) {
  const { data } = await db.from("sources").select("*").order("created_at");
  return (data ?? []) as Source[];
}
