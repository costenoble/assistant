import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { listWorkspaces } from "@/lib/workspaces/queries";
import { WorkspaceDot } from "@/components/workspace/bits";
import { NewWorkspaceForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const { db } = await requireOwner();
  const rows = await listWorkspaces(db);
  const groups = [
    { title: "Espaces clients", rows: rows.filter((r) => r.kind === "client") },
    { title: "Espaces internes", rows: rows.filter((r) => r.kind === "internal") },
  ].filter((g) => g.rows.length);

  return (
    <div className="max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="page-title">Espaces de travail</h1>
        <p className="text-sm text-muted">Un tableau partagé par client ou par sujet. Les membres invités y créent des tâches, commentent et valident.</p>
      </div>

      <section aria-label="Nouvel espace" className="card p-4">
        <NewWorkspaceForm />
      </section>

      {groups.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="section-title">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.rows.map((w) => (
              <Link key={w.id} href={`/espaces/${w.id}`} className="card flex flex-col gap-4 p-4 transition hover:border-border-strong">
                <div className="flex items-center gap-2.5">
                  <WorkspaceDot color={w.color} className="size-3.5" />
                  <span className="font-display text-[17px] font-semibold leading-6">{w.name}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span><strong className="font-semibold tabular-nums text-text">{w.todo}</strong> à faire</span>
                  {w.to_validate > 0 && <span className="text-high"><strong className="font-semibold tabular-nums">{w.to_validate}</strong> à valider</span>}
                  <span>{w.projects} projet{w.projects > 1 ? "s" : ""}</span>
                  <span>{w.members} membre{w.members > 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
