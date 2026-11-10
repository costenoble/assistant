import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { CLIENT_STATUS_LABELS, type Client } from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { CreateClientForm } from "./forms";

export const dynamic = "force-dynamic";

type Row = Client & { projects: { count: number }[]; client_contacts: { count: number }[] };

export default async function ClientsPage() {
  const { supabase } = await requireOwner();
  const { data } = await supabase
    .from("clients")
    .select("*, projects(count), client_contacts(count)")
    .order("status")
    .order("name");
  const clients = (data ?? []) as Row[];

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
            {clients.map((c) => (
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
                    <span>{c.projects[0]?.count ?? 0} projet(s)</span>
                    <span>{c.client_contacts[0]?.count ?? 0} contact(s)</span>
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
