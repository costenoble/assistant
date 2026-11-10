import { requireOwner } from "@/lib/auth/require-owner";
import { getTodayData } from "@/lib/items/queries";
import { EmptyState, ItemRow } from "@/components/item-row";
import { QuickAdd } from "@/components/quick-add";
import { formatLongDay, formatTime } from "@/lib/time/paris";
import type { Item } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { supabase } = await requireOwner();
  const now = new Date();
  const data = await getTodayData(supabase, now);
  const nextEvent = data.events.find((e) => e.ends_at && new Date(e.ends_at) > now);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm capitalize text-muted">{formatLongDay(now)}</p>
        <h1 className="text-2xl font-semibold">Aujourd&apos;hui</h1>
        <Summary
          overdue={data.overdueCount}
          events={data.events.length}
          emails={data.emails.length}
          waiting={data.waitingCount}
          nextEvent={nextEvent}
        />
      </header>

      <QuickAdd />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <h2 className="section-title border-b border-border px-4 py-3">À faire maintenant</h2>
            {data.focus.length ? (
              <ul className="divide-y divide-border">
                {data.focus.map((it) => <ItemRow key={it.id} item={it} now={now} />)}
              </ul>
            ) : (
              <EmptyState>Rien d&apos;urgent. Profite-en pour avancer sur un projet de fond.</EmptyState>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="section-title border-b border-border px-4 py-3">Mails qui attendent une réponse</h2>
            {data.emails.length ? (
              <ul className="divide-y divide-border">
                {data.emails.map((it) => <ItemRow key={it.id} item={it} now={now} />)}
              </ul>
            ) : (
              <EmptyState>Boîte de réception sous contrôle.</EmptyState>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Agenda title="Agenda du jour" events={data.events} now={now} empty="Aucun rendez-vous aujourd'hui." />
          <Agenda title="Demain" events={data.tomorrowEvents} now={now} empty="Rien de prévu demain." />
        </aside>
      </div>
    </div>
  );
}

function Summary(p: { overdue: number; events: number; emails: number; waiting: number; nextEvent?: Item }) {
  const parts: string[] = [];
  if (p.overdue) parts.push(`${p.overdue} en retard`);
  parts.push(`${p.events} RDV`);
  parts.push(`${p.emails} mail${p.emails > 1 ? "s" : ""} à traiter`);
  if (p.waiting) parts.push(`${p.waiting} en attente`);
  return (
    <p className="text-sm text-muted">
      {parts.join(" · ")}
      {p.nextEvent?.starts_at && (
        <> — prochain : <span className="text-text">{p.nextEvent.title}</span> à {formatTime(p.nextEvent.starts_at)}</>
      )}
    </p>
  );
}

function Agenda({ title, events, now, empty }: { title: string; events: Item[]; now: Date; empty: string }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="section-title border-b border-border px-4 py-3">{title}</h2>
      {events.length ? (
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const past = e.ends_at ? new Date(e.ends_at) < now : false;
            const live = !past && e.starts_at && new Date(e.starts_at) <= now;
            const meta = e.metadata as { location?: string | null; allDay?: boolean; online?: boolean };
            return (
              <li key={e.id} className={`flex gap-3 px-4 py-3 ${past ? "opacity-45" : ""}`}>
                <div className="w-12 shrink-0 text-sm font-medium tabular-nums">
                  {meta.allDay ? "Journée" : e.starts_at ? formatTime(e.starts_at) : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {live && <span className="mr-1.5 inline-block size-2 rounded-full bg-ok align-middle" />}
                    {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a> : e.title}
                  </p>
                  {(meta.location || meta.online) && (
                    <p className="truncate text-xs text-muted">{meta.location || "Visio"}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </section>
  );
}
