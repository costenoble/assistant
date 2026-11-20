import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireClient } from "@/lib/auth/require-client";
import { getPortalTickets } from "@/lib/auth/access";
import { clients } from "@/lib/db/schema";
import { TICKET_STATUS_LABELS_CLIENT } from "@/lib/db/types";
import { getOwnerProfile } from "@/lib/profile/service";
import { avatarUrl } from "@/lib/profile/avatar-url";
import { formatLongDay, relative } from "@/lib/time/paris";
import { Avatar, WORKSPACE_DOT, WorkspaceDot } from "@/components/workspace/bits";
import { EmptyState } from "@/components/item-row";

export const dynamic = "force-dynamic";

const delay = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function PortalHome() {
  // Lecture bornée aux espaces du membre connecté, hors brouillons.
  const { db, contact, clientIds } = await requireClient();
  const [all, workspaces, owner] = await Promise.all([
    getPortalTickets(db, clientIds),
    clientIds.length ? db.select({ id: clients.id, name: clients.name, color: clients.color }).from(clients).where(inArray(clients.id, clientIds)) : Promise.resolve([]),
    getOwnerProfile(db),
  ]);
  const now = new Date();
  const requests = all.filter((t) => t.kind === "request");
  const tasks = all.filter((t) => t.kind === "task");
  const toValidate = all.filter((t) => t.status === "waiting_client").length;
  const mine = tasks.filter((t) => t.assignee_contact_id === contact.id && !["resolved", "canceled"].includes(t.status)).length;
  const openRequests = requests.filter((r) => !["resolved", "canceled"].includes(r.status)).length;
  const firstName = contact.full_name.split(" ")[0];
  const hour = Number(now.toLocaleString("fr-FR", { hour: "numeric", hour12: false, timeZone: "Europe/Paris" }));
  const hello = hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour";
  const team = owner.name ?? "Notre équipe";

  const stats = [
    { label: "à valider", value: toValidate, tone: toValidate ? "text-accent" : "text-text" },
    { label: mine > 1 ? "tâches assignées à vous" : "tâche assignée à vous", value: mine, tone: "text-text" },
    { label: openRequests > 1 ? "demandes en cours" : "demande en cours", value: openRequests, tone: "text-text" },
  ];

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="rise-in space-y-2">
          <p className="text-sm capitalize text-muted">{formatLongDay(now)}</p>
          <h1 className="font-display text-[34px] font-semibold leading-[40px] tracking-[-0.02em] md:text-[40px] md:leading-[46px]">
            {hello} {firstName} <span className="inline-block origin-[70%_70%] animate-[wave_1.6s_ease-in-out_1]">👋</span>
          </h1>
          <p className="text-[15px] text-muted">
            {toValidate > 0
              ? toValidate === 1 ? "Une tâche attend votre validation." : `${toValidate} tâches attendent votre validation.`
              : "Tout est à jour de votre côté. Voici où en sont vos projets."}
          </p>
        </div>
        <Link href="/portail/demandes/nouvelle" className="rise-in btn-primary h-11 px-5" style={delay(1)}>Nouvelle demande</Link>
      </section>

      <section aria-label="En un coup d'œil" className="grid gap-3 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div key={s.label} className="rise-in card card-hover p-5" style={delay(i + 1)}>
            <p className={`font-display text-4xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="espaces-h" className="min-w-0 space-y-3">
          <h2 id="espaces-h" className="section-title">Vos espaces de travail</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((w, i) => {
              const wsTasks = tasks.filter((t) => t.client_id === w.id);
              const waiting = wsTasks.filter((t) => t.status === "waiting_client").length;
              const active = wsTasks.filter((t) => ["open", "in_progress"].includes(t.status)).length;
              const done = wsTasks.filter((t) => t.status === "resolved").length;
              return (
                <Link key={w.id} href={`/portail/espaces/${w.id}`} className="rise-in card group relative flex flex-col gap-4 overflow-hidden p-5" style={delay(i + 2)}>
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${WORKSPACE_DOT[w.color]}`} />
                  <h3 className="flex items-center gap-2.5 font-display text-[20px] font-semibold leading-7">
                    <WorkspaceDot color={w.color} className="size-3.5" />
                    {w.name}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {waiting > 0 && <span className="font-semibold text-accent">{waiting} à valider</span>}
                    <span>{active} en cours</span>
                    <span>{done} terminée{done > 1 ? "s" : ""}</span>
                  </div>
                  <span className="mt-auto text-sm font-medium text-accent transition group-hover:translate-x-1">Ouvrir l&apos;espace →</span>
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="space-y-3">
          <h2 className="section-title">Votre interlocuteur</h2>
          <div className="rise-in card flex items-center gap-4 p-5" style={delay(3)}>
            <Avatar name={team} owner src={avatarUrl("moi", owner.avatar_key)} size="size-14 text-base" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{team}</p>
              <p className="text-sm text-muted">Répond à vos demandes et suit vos projets.</p>
            </div>
          </div>
        </aside>
      </div>

      <section aria-labelledby="demandes-h" className="space-y-3">
        <h2 id="demandes-h" className="section-title">Vos demandes récentes</h2>
        <div className="rise-in card overflow-hidden" style={delay(4)}>
          {requests.length ? (
            <ul className="divide-y divide-border/70">
              {requests.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <Link href={`/portail/demandes/${r.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-surface-2/60">
                    <span className="min-w-0">
                      <span className="mr-2 text-sm tabular-nums text-muted">#{r.number}</span>
                      <span className="font-medium">{r.subject}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {relative(r.last_message_at, now)}
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${r.status === "waiting_client" ? "bg-accent/10 text-accent" : r.status === "resolved" ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted"}`}>
                        {TICKET_STATUS_LABELS_CLIENT[r.status]}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucune demande pour le moment. Une question ou un souci ? Cliquez sur « Nouvelle demande ».</EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
