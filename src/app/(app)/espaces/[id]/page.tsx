import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getWorkspace } from "@/lib/workspaces/queries";
import { allLabels, filterTasks, type TaskFilterParams } from "@/lib/workspaces/filter";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { Board } from "@/components/workspace/board";
import { TaskList } from "@/components/workspace/task-list";
import { Avatar, WorkspaceDot } from "@/components/workspace/bits";
import { IconBoard, IconList, IconLock } from "@/components/icons";
import { AddContactForm, AddProjectForm, DeleteContactButton, PortalAccessToggle, ProjectStatusSelect } from "../../clients/forms";
import { moveTaskAction } from "../actions";
import { IdeasPanel } from "@/components/assistant/ideas";
import { aiAvailable } from "@/lib/ai/claude";
import { DeleteWorkspaceForm, NewTaskPanel, TaskFilters, WorkspaceSettingsForm } from "../forms";
import { workspaceFootprint } from "@/lib/workspaces/delete";

export const dynamic = "force-dynamic";
// Brouillons et idées de Claude : jusqu'à une vingtaine de secondes.
export const maxDuration = 120;

const VIEWS = [
  { key: "tableau", label: "Tableau" },
  { key: "liste", label: "Liste" },
  { key: "projets", label: "Projets" },
  { key: "membres", label: "Membres" },
  { key: "reglages", label: "Réglages" },
] as const;
type View = (typeof VIEWS)[number]["key"];

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<TaskFilterParams & { vue?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const data = await getWorkspace(db, parsed.data);
  if (!data) notFound();
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v.key === sp.vue)?.key ?? "tableau";
  const { workspace, contacts, projects, tasks } = data;
  const members = contacts.filter((c) => c.portal_access);
  const shown = filterTasks(tasks, sp);
  const viewHref = (v: View) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, val]) => k !== "vue" && val) as [string, string][]);
    if (v !== "tableau") q.set("vue", v);
    const s = q.toString();
    return `/espaces/${workspace.id}${s ? `?${s}` : ""}`;
  };
  const options = {
    contacts: contacts.map((c) => ({ id: c.id, name: c.full_name })),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link href="/espaces" className="text-sm text-muted hover:text-text">← Espaces</Link>
          <h1 className="page-title flex items-center gap-3">
            <WorkspaceDot color={workspace.color} className="size-4" />
            {workspace.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            {members.length ? (
              <span className="flex items-center gap-2">
                <span className="flex -space-x-1.5">{members.slice(0, 5).map((m) => <Avatar key={m.id} name={m.full_name} />)}</span>
                {members.length} membre{members.length > 1 ? "s" : ""}
              </span>
            ) : (
              <Link href={viewHref("membres")} className="text-high hover:underline">Aucun membre : invite quelqu&apos;un</Link>
            )}
            {workspace.kind === "client" && <Link href={`/clients/${workspace.id}`} className="hover:text-text">Fiche client →</Link>}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/reunions?espace=${workspace.id}`} className="btn">Lancer une réunion</Link>
          {aiAvailable() && <IdeasPanel workspaceId={workspace.id} projects={options.projects} />}
          {(view === "tableau" || view === "liste") && (
            <NewTaskPanel workspaceId={workspace.id} {...options} defaultProject={sp.projet} />
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vues" className="tabs">
          {VIEWS.map((v) => (
            <Link key={v.key} href={viewHref(v.key)} aria-current={view === v.key ? "page" : undefined} className="tab inline-flex items-center gap-1.5">
              {v.key === "tableau" && <IconBoard />}
              {v.key === "liste" && <IconList />}
              {v.label}
            </Link>
          ))}
        </nav>
        {(view === "tableau" || view === "liste") && <TaskFilters {...options} labels={allLabels(tasks)} />}
      </div>

      {view === "tableau" && <Board tasks={shown} viewer="admin" basePath="/tickets" onMove={moveTaskAction} />}
      {view === "liste" && <TaskList tasks={shown} viewer="admin" basePath="/tickets" />}

      {view === "projets" && (
        <section className="card divide-y divide-border">
          {projects.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/espaces/${workspace.id}?projet=${p.id}`} className="flex items-center gap-2 font-medium hover:underline">
                  {p.status === "draft" && <IconLock className="text-high" />}
                  {p.name}
                </Link>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{tasks.filter((t) => t.project_id === p.id && t.status !== "resolved" && t.status !== "canceled").length} tâche(s) ouverte(s)</span>
                <ProjectStatusSelect projectId={p.id} clientId={workspace.id} status={p.status} />
              </div>
            </div>
          ))}
          {!projects.length && <p className="px-4 py-6 text-center text-sm text-muted">Aucun projet. Un projet regroupe des tâches : une app, une refonte, une campagne…</p>}
          <div className="px-4 py-4"><AddProjectForm clientId={workspace.id} /></div>
          <p className="px-4 py-3 text-xs text-muted">
            Un projet en {PROJECT_STATUS_LABELS.draft.toLowerCase()} et ses tâches restent invisibles des membres.
          </p>
        </section>
      )}

      {view === "reglages" && (
        <div className="max-w-3xl space-y-6">
          <section className="card space-y-3 p-5">
            <h2 className="section-title">Espace</h2>
            <WorkspaceSettingsForm workspaceId={workspace.id} name={workspace.name} color={workspace.color} />
          </section>
          <section className="card space-y-3 border-critical/40 p-5">
            <h2 className="section-title text-critical">Supprimer l&apos;espace</h2>
            <DeleteWorkspaceForm workspaceId={workspace.id} name={workspace.name} footprint={await workspaceFootprint(db, workspace.id)} />
          </section>
        </div>
      )}

      {view === "membres" && (
        <section className="card divide-y divide-border">
          {contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={c.full_name} size="size-8" />
                <div className="min-w-0">
                  <p className="font-medium">{c.full_name}{c.job_title && <span className="font-normal text-muted"> · {c.job_title}</span>}</p>
                  <p className="text-xs text-muted">{c.email ?? "pas d'email"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PortalAccessToggle contactId={c.id} enabled={c.portal_access} hasEmail={!!c.email} />
                <DeleteContactButton contactId={c.id} clientId={workspace.id} />
              </div>
            </div>
          ))}
          {!contacts.length && <p className="px-4 py-6 text-center text-sm text-muted">Ajoute une personne, puis clique sur « Inviter » : elle reçoit un email et accède à l&apos;espace.</p>}
          <div className="px-4 py-4"><AddContactForm clientId={workspace.id} /></div>
        </section>
      )}
    </div>
  );
}
