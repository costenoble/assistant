import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getProjectDetail } from "@/lib/projects/queries";
import { formatDay } from "@/lib/time/paris";
import { TicketStatusBadge } from "@/components/ticket-list";
import { IconLock } from "@/components/icons";
import { ProjectStatusSelect } from "../../clients/forms";
import { NewTaskForm } from "../forms";

export const dynamic = "force-dynamic";

type Task = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>["tasks"][number];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const detail = await getProjectDetail(db, parsed.data);
  if (!detail) notFound();
  const { project, client, tasks, portalContacts } = detail;

  const todo = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const toValidate = tasks.filter((t) => t.status === "waiting_client");
  const done = tasks.filter((t) => t.status === "resolved");
  const draft = project.status === "draft";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link href="/projets" className="text-sm text-muted hover:text-text">← Projets</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="page-title">{project.name}</h1>
            <p className="text-sm text-muted">
              <Link href={`/clients/${client.id}`} className="font-medium text-text hover:underline">{client.name}</Link>
              {project.due_on && <> · livraison prévue le {formatDay(project.due_on)}</>}
            </p>
          </div>
          <ProjectStatusSelect projectId={project.id} clientId={client.id} status={project.status} />
        </div>
        {project.description && <p className="max-w-2xl text-sm leading-6 text-muted">{project.description}</p>}
        <p className="flex items-center gap-2 text-sm">
          {draft ? (
            <span className="flex items-center gap-1.5 text-high"><IconLock /> Brouillon : invisible du client.</span>
          ) : portalContacts.length ? (
            <span className="text-muted">Partagé avec <span className="text-text">{portalContacts.map((c) => c.name).join(", ")}</span></span>
          ) : (
            <span className="text-high">Personne n&apos;y a accès. <Link href={`/clients/${client.id}`} className="underline">Invite un contact</Link> depuis la fiche client.</span>
          )}
        </p>
      </div>

      <section className="card p-4">
        <NewTaskForm projectId={project.id} canShare={!draft && portalContacts.length > 0} />
      </section>

      <TaskSection title="À faire" tasks={todo} empty="Rien à faire pour l'instant." />
      {toValidate.length > 0 && <TaskSection title="En attente de validation du client" tasks={toValidate} />}
      {done.length > 0 && (
        <details className="card overflow-hidden">
          <summary className="card-header cursor-pointer section-title">Faites ({done.length})</summary>
          <TaskList tasks={done} />
        </details>
      )}
    </div>
  );
}

function TaskSection({ title, tasks, empty }: { title: string; tasks: Task[]; empty?: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <h2 className="section-title">{title}</h2>
        <span className="text-xs text-muted">{tasks.length}</span>
      </div>
      {tasks.length ? <TaskList tasks={tasks} /> : <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link href={`/tickets/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-surface-2/50">
            <span className="w-10 shrink-0 text-sm tabular-nums text-muted">#{t.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {t.urgent && <span className="mr-1.5 rounded bg-critical/15 px-1.5 py-0.5 text-xs font-semibold text-critical">Bloquant</span>}
                {t.subject}
              </span>
              <span className="block text-xs text-muted">{t.author_name ? `Confiée par ${t.author_name}` : "Créée par toi"}</span>
            </span>
            <TicketStatusBadge status={t.status} kind="task" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
