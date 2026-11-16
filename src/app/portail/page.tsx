import { requireClient } from "@/lib/auth/require-client";
import Link from "next/link";
import { getPortalProjects, getPortalTickets } from "@/lib/auth/access";
import { PROJECT_STATUS_LABELS, TICKET_STATUS_LABELS_CLIENT } from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { formatDay, relative } from "@/lib/time/paris";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  // Lecture bornée aux clients du contact connecté, hors brouillons.
  const { db, contact, clientIds } = await requireClient();
  const [projects, requests] = await Promise.all([getPortalProjects(db, clientIds), getPortalTickets(db, clientIds)]);
  const now = new Date();
  const awaitingYou = requests.filter((r) => r.status === "waiting_client").length;
  const firstName = contact.full_name.split(" ")[0];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="page-title text-[32px] leading-[38px]">Bonjour {firstName}</h1>
          <p className="text-[15px] text-muted">
            {awaitingYou > 0
              ? awaitingYou === 1 ? "Une réponse vous attend dans vos demandes." : `${awaitingYou} réponses vous attendent dans vos demandes.`
              : "Retrouvez ici l'avancement de vos projets et vos échanges avec nous."}
          </p>
        </div>
        <Link href="/portail/demandes/nouvelle" className="btn-primary h-10 px-5">Nouvelle demande</Link>
      </div>

      <section aria-labelledby="projets-h" className="space-y-3">
        <h2 id="projets-h" className="section-title">Vos projets</h2>
        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <article key={p.id} className="card flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[17px] font-semibold leading-6">{p.name}</h3>
                  <span className="shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </div>
                {p.description && <p className="text-sm leading-6 text-muted">{p.description}</p>}
                {p.due_on && <p className="mt-auto text-sm text-muted">Livraison prévue le {formatDay(p.due_on)}</p>}
              </article>
            ))}
          </div>
        ) : (
          <div className="card"><EmptyState>Aucun projet partagé pour le moment.</EmptyState></div>
        )}
      </section>

      <section aria-labelledby="demandes-h" className="space-y-3">
        <h2 id="demandes-h" className="section-title">Vos demandes</h2>
        <div className="card overflow-hidden">
          {requests.length ? (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/portail/demandes/${r.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-surface-2/60">
                    <span className="min-w-0">
                      <span className="mr-2 text-sm tabular-nums text-muted">#{r.number}</span>
                      <span className="font-medium">{r.subject}</span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {relative(r.last_message_at, now)}
                      <span className={`rounded-md px-2 py-0.5 font-semibold ${r.status === "waiting_client" ? "bg-accent/10 text-accent" : r.status === "resolved" ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted"}`}>
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
