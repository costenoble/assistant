import Link from "next/link";
import type { TaskCard } from "@/lib/workspaces/queries";
import { parisParts } from "@/lib/time/paris";
import { PriorityIcon } from "../workspace/bits";

const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const pad = (n: number) => String(n).padStart(2, "0");

/** Mois affiché (« 2026-11 »), ou le mois en cours. */
export function parseMonth(raw: string | undefined) {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
  const p = parisParts(new Date());
  return { year: p.year, month: p.month };
}

/**
 * Calendrier du mois : chaque tâche à son échéance. `monthHref` construit le
 * lien vers un autre mois (garde les autres paramètres de la page).
 */
export function MonthCalendar({ tasks, year, month, taskHref, monthHref }: { tasks: TaskCard[]; year: number; month: number; taskHref: string; monthHref: (m: string) => string }) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const today = parisParts(new Date());
  const todayKey = `${today.year}-${pad(today.month)}-${pad(today.day)}`;
  const byDay = new Map<string, TaskCard[]>();
  for (const t of tasks) if (t.due_on && t.status !== "canceled") byDay.set(t.due_on, [...(byDay.get(t.due_on) ?? []), t]);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  const undated = tasks.filter((t) => !t.due_on && t.status !== "resolved" && t.status !== "canceled").length;
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);

  return (
    <section aria-label="Calendrier" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold capitalize">{first.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
        <div className="flex gap-1">
          <Link href={monthHref(prev)} className="btn h-8 px-2.5" aria-label="Mois précédent">←</Link>
          <Link href={monthHref(`${today.year}-${pad(today.month)}`)} className="btn h-8">Aujourd&apos;hui</Link>
          <Link href={monthHref(next)} className="btn h-8 px-2.5" aria-label="Mois suivant">→</Link>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-border">
          {DAYS.map((d) => <div key={d} className="border-b border-border bg-surface-2/50 px-2 py-1.5 text-xs font-semibold text-muted">{d}</div>)}
          {cells.map((day, i) => {
            const inMonth = day >= 1 && day <= days;
            const key = `${year}-${pad(month)}-${pad(day)}`;
            const list = inMonth ? (byDay.get(key) ?? []) : [];
            return (
              <div key={i} className={`min-h-24 border-b border-border p-1.5 ${i % 7 !== 6 ? "border-r" : ""} ${inMonth ? "bg-surface" : "bg-surface-2/30"}`}>
                {inMonth && (
                  <>
                    <p className={`mb-1 text-xs tabular-nums ${key === todayKey ? "inline-flex size-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink" : "text-muted"}`}>{day}</p>
                    <ul className="space-y-1">
                      {list.slice(0, 3).map((t) => (
                        <li key={t.id}>
                          <Link href={`${taskHref}/${t.id}`} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-4 hover:bg-surface-2 ${t.status === "resolved" ? "text-muted line-through" : ""}`}>
                            <PriorityIcon priority={t.priority} className="size-3" />
                            <span className="truncate">{t.subject}</span>
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 && <li className="px-1 text-[11px] text-muted">+ {list.length - 3}</li>}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {undated > 0 && <p className="text-xs text-muted">{undated} tâche{undated > 1 ? "s" : ""} ouverte{undated > 1 ? "s" : ""} sans échéance n&apos;apparai{undated > 1 ? "ssent" : "t"} pas ici.</p>}
    </section>
  );
}
