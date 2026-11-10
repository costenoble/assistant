import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSource, markSourceSynced, selectAll, upsertItems, type IncomingItem } from "@/lib/items/repo";
import { getAccessToken } from "./oauth";

/**
 * Synchro Microsoft 365 (Semaphors) :
 *  - Agenda Outlook : RDV d'hier à J+14 → items « event ».
 *  - Mails drapeautés : chaque mail flaggé dans Outlook → tâche Cockpit,
 *    avec l'échéance du drapeau. Drapeau « terminé » → tâche faite.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";
const TZ = "Europe/Paris";
export const MICROSOFT_SOURCE_SLUG = "microsoft-365";

interface GraphEvent {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  webLink: string | null;
  isCancelled: boolean;
  isAllDay: boolean;
  showAs: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null;
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

interface GraphMessage {
  id: string;
  subject: string | null;
  bodyPreview: string | null;
  webLink: string | null;
  importance: "low" | "normal" | "high";
  receivedDateTime: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  flag: {
    flagStatus: "notFlagged" | "flagged" | "complete";
    dueDateTime?: { dateTime: string; timeZone: string };
  };
}

/** Toutes les pages d'une liste Graph. `complete` = false si on s'est arrêté à maxPages. */
async function graphGetAll<T>(token: string, url: string, maxPages = 10): Promise<{ items: T[]; complete: boolean }> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < maxPages; page++) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.timezone="UTC"` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Graph ${res.status} : ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { value: T[]; "@odata.nextLink"?: string };
    out.push(...json.value);
    next = json["@odata.nextLink"];
  }
  return { items: out, complete: !next };
}

/** Graph renvoie des dates sans « Z » quand outlook.timezone=UTC. */
const utc = (dt: string) => (dt.endsWith("Z") ? dt : `${dt}Z`);

export async function syncMicrosoft(db: SupabaseClient, ownerId: string) {
  const token = await getAccessToken(db);
  if (!token) return { skipped: true as const };

  const source = await ensureSource(db, ownerId, {
    slug: MICROSOFT_SOURCE_SLUG,
    name: "Microsoft 365 · Semaphors",
    kind: "microsoft",
    default_context: "semaphors",
  });

  try {
    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 14 * 86_400_000);
    const select = "id,subject,bodyPreview,webLink,isCancelled,isAllDay,showAs,start,end,location,onlineMeeting,organizer";
    const [eventsRes, flaggedRes] = await Promise.all([
      graphGetAll<GraphEvent>(
        token,
        `${GRAPH}/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=${select}&$orderby=start/dateTime&$top=100`,
      ),
      graphGetAll<GraphMessage>(
        token,
        `${GRAPH}/me/messages?$filter=flag/flagStatus eq 'flagged'&$select=id,subject,bodyPreview,webLink,importance,receivedDateTime,from,flag&$top=100`,
        10,
      ),
    ]);
    const events = eventsRes.items;
    const flagged = flaggedRes.items;

    const eventItems: IncomingItem[] = events.map((e) => ({
      external_id: `event:${e.id}`,
      kind: "event",
      title: e.subject || "(sans titre)",
      body: e.bodyPreview || null,
      url: e.onlineMeeting?.joinUrl ?? e.webLink,
      starts_at: utc(e.start.dateTime),
      ends_at: utc(e.end.dateTime),
      initial_status: "todo",
      status: e.isCancelled ? "archived" : undefined,
      metadata: {
        location: e.location?.displayName || null,
        allDay: e.isAllDay,
        showAs: e.showAs,
        organizer: e.organizer?.emailAddress?.name ?? null,
        online: !!e.onlineMeeting?.joinUrl,
        timeZone: TZ,
      },
    }));

    const taskItems: IncomingItem[] = flagged.map((m) => ({
      external_id: `flag:${m.id}`,
      kind: "task",
      title: m.subject || "(sans objet)",
      body: m.bodyPreview || null,
      url: m.webLink,
      source_priority: m.importance === "high" ? 2 : 3,
      due_at: m.flag.dueDateTime ? utc(m.flag.dueDateTime.dateTime) : null,
      initial_status: "todo",
      metadata: { from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? null, outlookFlag: true },
    }));

    await upsertItems(db, ownerId, source, [...eventItems, ...taskItems]);

    // Nettoyage : RDV supprimés dans Outlook et drapeaux retirés / terminés.
    const seen = new Set([...eventItems, ...taskItems].map((i) => i.external_id));
    // On ne déduit « disparu » que d'une liste lue en entier (sinon on clôturerait à tort).
    const open = await selectAll<{ id: string; external_id: string; kind: string; starts_at: string | null }>((a, b) =>
      db
        .from("items")
        .select("id, external_id, kind, starts_at")
        .eq("source_id", source.id)
        .not("status", "in", "(done,archived)")
        .order("id")
        .range(a, b),
    );
    const stale = open.filter((it) => {
      if (seen.has(it.external_id)) return false;
      if (it.kind === "task") return flaggedRes.complete; // drapeau retiré ou terminé
      if (!eventsRes.complete) return false;
      const start = it.starts_at ? Date.parse(it.starts_at) : 0;
      return start >= from.getTime() && start <= to.getTime(); // RDV dans la fenêtre mais disparu
    });
    for (const it of stale) {
      await db.from("items").update({ status: it.kind === "task" ? "done" : "archived" }).eq("id", it.id);
    }

    await markSourceSynced(db, source.id, null);
    return { skipped: false as const, events: eventItems.length, flagged: taskItems.length, closed: stale.length };
  } catch (err) {
    await markSourceSynced(db, source.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
