import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { listProjects } from "@/lib/projects/queries";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { IconLock } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { db } = await requireOwner();
  const rows = await listProjects(db);
  // Regroupement par client (Map.groupBy n'existe pas dans Node 20).
  const byClient = new Map<string, typeof rows>();
  for (const r of rows) byClient.set(r.client.id, [...(byClient.get(r.client.id) ?? []), r]);

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="page-title">Projets</h1>
        <p className="text-sm text-muted">Les tâches partagées avec tes clients. Ils en créent depuis leur espace, commentent et valident ton travail.</p>
      </div>
      {rows.length === 0 && (
        <div className="card">
          <EmptyState>Aucun projet. Crée-en un depuis la fiche d&apos;un <Link href="/clients" className="text-accent hover:underline">client</Link>.</EmptyState>
        </div>
      )}
      {[...byClient.values()].map((group) => (
        <section key={group[0]!.client.id} aria-label={group[0]!.client.name} className="space-y-3">
          <h2 className="section-title">
            <Link href={`/clients/${group[0]!.client.id}`} className="hover:text-text">{group[0]!.client.name}</Link>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.map(({ project: p, todo, to_validate, done }) => (
              <Link key={p.id} href={`/projets/${p.id}`} className="card flex flex-col gap-3 p-4 transition hover:border-border-strong">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-display text-[16px] font-semibold leading-6">{p.name}</span>
                  <span className="chip shrink-0">
                    {p.status === "draft" && <IconLock className="size-3" />}
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span><strong className="font-semibold text-text tabular-nums">{todo}</strong> à faire</span>
                  <span className={to_validate ? "text-high" : ""}><strong className="font-semibold tabular-nums">{to_validate}</strong> à valider</span>
                  <span><strong className="font-semibold tabular-nums">{done}</strong> faites</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
