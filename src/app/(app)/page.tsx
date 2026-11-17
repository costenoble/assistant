import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { getTodayData } from "@/lib/items/queries";
import { EmptyState, ItemRow } from "@/components/item-row";
import { getClientOptions } from "@/lib/clients/link";
import { QuickAdd } from "@/components/quick-add";
import { formatLongDay, formatTime } from "@/lib/time/paris";
import type { Item } from "@/lib/db/types";
import { aiAvailable } from "@/lib/ai/claude";
import { getTodayBrief } from "@/lib/ai/assistant";
import { MorningBrief } from "@/components/assistant/brief";

export const dynamic = "force-dynamic";
// Brouillons et idées de Claude : jusqu'à une vingtaine de secondes.
export const maxDuration = 120;

export default async function TodayPage() {
  const { db } = await requireOwner();
  const now = new Date();
  const ai = aiAvailable();
  const [data, clients, brief] = await Promise.all([getTodayData(db, now), getClientOptions(db), ai ? getTodayBrief(db) : Promise.resolve(null)]);
  const nextEvent = data.events.find((e) => e.ends_at && new Date(e.ends_at) > now);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow capitalize">{formatLongDay(now)}</p>
          <h1 className="page-title">Aujourd&apos;hui</h1>
          {nextEvent?.starts_at && (
            <p className="text-sm text-muted">
              Prochain rendez-vous : <span className="text-text">{nextEvent.title}</span> à {formatTime(nextEvent.starts_at)}
            </p>
          )}
        </div>
        <ul aria-label="Résumé" className="flex flex-wrap gap-2">
          {data.overdueCount > 0 && <Stat value={data.overdueCount} label="en retard" tone="alert" />}
          <Stat value={data.events.length} label={data.events.length > 1 ? "rendez-vous" : "rendez-vous"} />
          <Stat value={data.emails.length} label={data.emails.length > 1 ? "mails à traiter" : "mail à traiter"} />
          {data.waitingCount > 0 && <Stat value={data.waitingCount} label="en attente" />}
        </ul>
      </header>

      {ai && <MorningBrief initial={brief} />}

      <QuickAdd />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="focus-h" className="card overflow-hidden">
            <div className="card-header">
              <h2 id="focus-h" className="section-title">À faire maintenant</h2>
              {data.focus.length > 0 && <span className="text-xs text-muted">{data.focus.length} élément{data.focus.length > 1 ? "s" : ""}</span>}
            </div>
            {data.focus.length ? (
              <ul className="divide-y divide-border">
                {data.focus.map((it) => <ItemRow key={it.id} item={it} now={now} clients={clients} />)}
              </ul>
            ) : (
              <EmptyState>Rien d&apos;urgent. Profite-en pour avancer sur un projet de fond.</EmptyState>
            )}
          </section>

          <section aria-labelledby="mails-h" className="card overflow-hidden">
            <div className="card-header">
              <h2 id="mails-h" className="section-title">Mails qui attendent une réponse</h2>
              <Link href="/inbox" className="text-xs text-accent hover:underline">Tous les mails</Link>
            </div>
            {data.emails.length ? (
              <ul className="divide-y divide-border">
                {data.emails.map((it) => <ItemRow key={it.id} item={it} now={now} clients={clients} />)}
              </ul>
            ) : (
              <EmptyState>Boîte de réception sous contrôle.</EmptyState>
            )}
          </section>
        </div>

        <aside className="card h-fit overflow-hidden">
          <Agenda title="Agenda du jour" events={data.events} now={now} empty="Aucun rendez-vous aujourd'hui." />
          <div className="border-t border-border" />
          <Agenda title="Demain" events={data.tomorrowEvents} now={now} empty="Rien de prévu demain." />
        </aside>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "alert" }) {
  return (
    <li
      className={`flex items-baseline gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
        tone === "alert" ? "bg-critical/12 text-critical" : "bg-surface text-muted ring-1 ring-border"
      }`}
    >
      <strong className={`text-base font-semibold tabular-nums ${tone === "alert" ? "" : "text-text"}`}>{value}</strong>
      {label}
    </li>
  );
}

function Agenda({ title, events, now, empty }: { title: string; events: Item[]; now: Date; empty: string }) {
  return (
    <section>
      <h2 className="section-title px-4 pb-1 pt-3.5">{title}</h2>
      {events.length ? (
        <ul>
          {events.map((e) => {
            const past = e.ends_at ? new Date(e.ends_at) < now : false;
            const startsIn = e.starts_at ? new Date(e.starts_at).getTime() - now.getTime() : null;
            const live = !past && startsIn !== null && startsIn <= 0;
            const soon = !past && startsIn !== null && startsIn > 0 && startsIn <= 3_600_000;
            const meta = e.metadata as { location?: string | null; allDay?: boolean; online?: boolean };
            return (
              <li key={e.id} className={`flex gap-3 px-4 py-2.5 ${past ? "opacity-50" : ""} ${live || soon ? "bg-accent/8" : ""}`}>
                <div className={`w-12 shrink-0 pt-px text-sm tabular-nums ${live || soon ? "font-semibold text-accent" : "font-medium"}`}>
                  {meta.allDay ? "Jour" : e.starts_at ? formatTime(e.starts_at) : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a> : e.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {live ? "En cours" : soon ? `Dans ${Math.max(1, Math.round(startsIn! / 60_000))} min` : past ? "Terminé" : null}
                    {(live || soon || past) && (meta.location || meta.online) ? " · " : null}
                    {meta.location || (meta.online ? "Visio" : null)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 pb-4 pt-1 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
