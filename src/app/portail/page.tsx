import { requireClient } from "@/lib/auth/require-client";
import { getPortalProjects } from "@/lib/auth/access";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { formatDay } from "@/lib/time/paris";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  // Lecture bornée aux clients du contact connecté, hors brouillons.
  const { db, contact, clientIds } = await requireClient();
  const projects = await getPortalProjects(db, clientIds);
  const firstName = contact.full_name.split(" ")[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Bonjour {firstName}</h1>
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
    </div>
  );
}
