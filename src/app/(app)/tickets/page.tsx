import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { listTickets, TICKET_FILTERS, type TicketFilter } from "@/lib/tickets/queries";
import { EmptyState } from "@/components/item-row";
import { TicketList } from "@/components/ticket-list";

export const dynamic = "force-dynamic";

const EMPTY: Record<TicketFilter, string> = {
  todo: "Aucune demande en attente de toi.",
  waiting: "Aucune demande en attente d'une réponse du client.",
  resolved: "Aucune demande résolue pour l'instant.",
};

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { db } = await requireOwner();
  const f = (await searchParams).f;
  const filter: TicketFilter = f && f in TICKET_FILTERS ? (f as TicketFilter) : "todo";
  const rows = await listTickets(db, filter);
  const now = new Date();

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted">Les demandes envoyées par tes clients depuis leur espace.</p>
      </div>
      <nav aria-label="Filtrer les tickets" className="flex flex-wrap gap-1">
        {(Object.keys(TICKET_FILTERS) as TicketFilter[]).map((k) => (
          <Link
            key={k}
            href={k === "todo" ? "/tickets" : `/tickets?f=${k}`}
            aria-current={k === filter ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${k === filter ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2"}`}
          >
            {TICKET_FILTERS[k].label}
          </Link>
        ))}
      </nav>
      <section className="card overflow-hidden">
        {rows.length ? <TicketList rows={rows} now={now} /> : <EmptyState>{EMPTY[filter]}</EmptyState>}
      </section>
    </div>
  );
}
