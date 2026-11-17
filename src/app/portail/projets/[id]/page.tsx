import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalProject } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS_CLIENT } from "@/lib/db/types";
import { formatDay, relative } from "@/lib/time/paris";
import { NewTaskForm } from "../../forms";

export const dynamic = "force-dynamic";

type Task = NonNullable<Awaited<ReturnType<typeof getPortalProject>>>["tasks"][number];

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, clientIds } = await requireClient();
  // Projet visible du contact uniquement (son client, hors brouillon).
  const data = await getPortalProject(db, clientIds, parsed.data);
  if (!data) notFound();
  const { project, tasks } = data;
  const now = new Date();

  const toValidate = tasks.filter((t) => t.status === "waiting_client");
  const active = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "resolved");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/portail" className="text-sm text-muted hover:text-text">← Votre espace</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title text-[32px] leading-[38px]">{project.name}</h1>
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{PROJECT_STATUS_LABELS[project.status]}</span>
        </div>
        {project.description && <p className="max-w-2xl text-[15px] leading-7 text-muted">{project.description}</p>}
        {project.due_on && <p className="text-sm text-muted">Livraison prévue le {formatDay(project.due_on)}</p>}
      </div>

      {toValidate.length > 0 && (
        <section aria-labelledby="valider-h" className="space-y-3">
          <h2 id="valider-h" className="section-title text-accent">À valider par vous ({toValidate.length})</h2>
          <TaskList tasks={toValidate} now={now} highlight />
        </section>
      )}

      <section className="card p-5">
        <NewTaskForm workspaceId={project.client_id} projectId={project.id} />
      </section>

      <section aria-labelledby="encours-h" className="space-y-3">
        <h2 id="encours-h" className="section-title">En cours ({active.length})</h2>
        {active.length ? (
          <TaskList tasks={active} now={now} />
        ) : (
          <p className="card px-5 py-8 text-center text-sm text-muted">Aucune tâche en cours. Ajoutez-en une ci-dessus.</p>
        )}
      </section>

      {done.length > 0 && (
        <details className="space-y-3">
          <summary className="section-title cursor-pointer">Faites ({done.length})</summary>
          <TaskList tasks={done} now={now} />
        </details>
      )}
    </div>
  );
}

function TaskList({ tasks, now, highlight }: { tasks: Task[]; now: Date; highlight?: boolean }) {
  return (
    <ul className={`card divide-y divide-border overflow-hidden ${highlight ? "border-accent/40" : ""}`}>
      {tasks.map((t) => (
        <li key={t.id}>
          <Link href={`/portail/demandes/${t.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 transition hover:bg-surface-2/60">
            <span className="min-w-0">
              <span className="block font-medium">
                {t.urgent && <span className="mr-1.5 rounded bg-critical/10 px-1.5 py-0.5 text-xs font-semibold text-critical">Prioritaire</span>}
                {t.subject}
              </span>
              <span className="block text-xs text-muted">
                {t.author_name ? `Demandée par ${t.author_name}` : "Ajoutée par notre équipe"} · {t.replies} message{t.replies > 1 ? "s" : ""} · {relative(t.last_message_at, now)}
              </span>
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${t.status === "waiting_client" ? "bg-accent text-accent-ink" : t.status === "resolved" ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted"}`}>
              {TASK_STATUS_LABELS_CLIENT[t.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
