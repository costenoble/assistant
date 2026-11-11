import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { asc, sql } from "drizzle-orm";
import { clients as clientsTable } from "@/lib/db/schema";
import { CLIENT_STATUS_LABELS } from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { CreateClientForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { db } = await requireOwner();
  // Noms de colonnes écrits en clair : dans une requête sans jointure, Drizzle retire
  // le préfixe de table des colonnes interpolées, ce qui fausserait ces sous-requêtes.
  const clients = await db
    .select({
      client: clientsTable,
      projectCount: sql<number>`(select count(*)::int from projects p where p.client_id = clients.id)`,
      contactCount: sql<number>`(select count(*)::int from client_contacts cc where cc.client_id = clients.id)`,
      openCount: sql<number>`(select count(*)::int from items i where i.client_id = clients.id and i.status not in ('done', 'archived'))`,
    })
    .from(clientsTable)
    .orderBy(asc(clientsTable.status), asc(clientsTable.name));

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Clients</h1>

      <section className="card space-y-3 p-5">
        <h2 className="section-title">Nouveau client</h2>
        <CreateClientForm />
      </section>

      <section className="card overflow-hidden">
        {clients.length ? (
          <ul className="divide-y divide-border">
            {clients.map(({ client: c, projectCount, contactCount, openCount }) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {c.email_domains.length ? c.email_domains.join(", ") : "aucun domaine mail"}
                      {c.website && <> · {c.website}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    {openCount > 0 && <span className="rounded-full bg-accent/15 px-2 font-semibold text-accent">{openCount} à traiter</span>}
                    <span>{projectCount} projet(s)</span>
                    <span>{contactCount} contact(s)</span>
                    <span className="rounded border border-border px-1.5 py-0.5">{CLIENT_STATUS_LABELS[c.status]}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Aucun client pour l&apos;instant.</EmptyState>
        )}
      </section>
    </div>
  );
}
