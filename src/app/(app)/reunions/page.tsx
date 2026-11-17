import Link from "next/link";
import { ne } from "drizzle-orm";
import { requireOwner } from "@/lib/auth/require-owner";
import { clients, projects } from "@/lib/db/schema";
import { listMeetings } from "@/lib/meetings/service";
import { formatDay, formatTime } from "@/lib/time/paris";
import { WorkspaceDot } from "@/components/workspace/bits";
import { StartMeetingForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ espace?: string }> }) {
  const { db } = await requireOwner();
  const [rows, wsRows, projectRows] = await Promise.all([
    listMeetings(db),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(ne(clients.status, "archived")).orderBy(clients.name),
    db.select({ id: projects.id, name: projects.name, client_id: projects.client_id }).from(projects).where(ne(projects.status, "archived")).orderBy(projects.name),
  ]);
  const workspaces = wsRows.map((w) => ({ ...w, projects: projectRows.filter((p) => p.client_id === w.id) }));
  const { espace } = await searchParams;

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="page-title">Réunions</h1>
        <p className="text-sm text-muted">Lance l&apos;écoute en début de réunion : Cockpit transcrit, puis Claude résume et te propose les tâches à créer dans l&apos;espace.</p>
      </div>

      <section aria-label="Nouvelle réunion" className="card p-4">
        {workspaces.length ? (
          <StartMeetingForm workspaces={workspaces} defaultWorkspace={espace} />
        ) : (
          <p className="text-sm text-muted">Crée d&apos;abord un <Link href="/espaces" className="underline">espace de travail</Link>.</p>
        )}
      </section>

      <section aria-labelledby="historique-h" className="space-y-3">
        <h2 id="historique-h" className="section-title">Historique</h2>
        {rows.length ? (
          <ul className="card divide-y divide-border">
            {rows.map((m) => {
              const created = m.proposals.filter((p) => p.ticket_id).length;
              const waiting = m.proposals.length - created;
              return (
                <li key={m.id}>
                  <Link href={`/reunions/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <WorkspaceDot color={m.client_color} className="size-2" />
                        {m.client_name} · {formatDay(m.started_at)} à {formatTime(m.started_at)} · {m.words} mots
                      </span>
                    </span>
                    <span className="text-xs">
                      {m.status === "ready" ? (
                        waiting > 0 ? <span className="font-medium text-high">{waiting} tâche{waiting > 1 ? "s" : ""} à trier</span> : <span className="text-ok">{created} tâche{created > 1 ? "s" : ""} créée{created > 1 ? "s" : ""}</span>
                      ) : m.status === "failed" ? (
                        <span className="text-danger">Analyse en échec</span>
                      ) : m.ended_at ? (
                        <span className="text-muted">À analyser</span>
                      ) : (
                        <span className="text-muted">En cours</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="card px-4 py-8 text-center text-sm text-muted">Aucune réunion pour l&apos;instant.</p>
        )}
      </section>
    </div>
  );
}
