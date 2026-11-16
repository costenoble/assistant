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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Bonjour {firstName}</h1>
          {awaitingYou > 0 && (
            <p className="text-sm text-muted">{awaitingYou === 1 ? "Une réponse vous attend" : `${awaitingYou} réponses vous attendent`} dans vos demandes.</p>
          )}
        </div>
        <Link href="/portail/demandes/nouvelle" className="btn-primary">Nouvelle demande</Link>
      </div>
      <section className="card overflow-hidden">
        <h2 className="section-title border-b border-border px-4 py-3">Vos projets</h2>
        {projects.length ? (
          <ul className="divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{p.name}</p>
                  <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </div>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
                {p.due_on && <p className="text-xs text-muted">Échéance prévue : {formatDay(p.due_on)}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Aucun projet partagé pour le moment.</EmptyState>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="section-title border-b border-border px-4 py-3">Vos demandes</h2>
        {requests.length ? (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/portail/demandes/${r.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 hover:bg-surface-2/60">
                  <span className="min-w-0">
                    <span className="mr-2 text-sm text-muted">#{r.number}</span>
                    <span className="font-medium">{r.subject}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {relative(r.last_message_at, now)}
                    <span className={`rounded px-1.5 py-0.5 font-medium ${r.status === "waiting_client" ? "bg-accent/15 text-accent" : "border border-border"}`}>
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
      </section>
    </div>
  );
}
