import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalWorkspace } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { allLabels, filterTasks } from "@/lib/workspaces/filter";
import { activityFeed, projectCards } from "@/lib/projects/overview";
import { Board } from "@/components/workspace/board";
import { TaskList } from "@/components/workspace/task-list";
import { TaskCardView } from "@/components/workspace/task-card";
import { Avatar, WorkspaceDot } from "@/components/workspace/bits";
import { Breadcrumb } from "@/components/projects/breadcrumb";
import { ProjectCard } from "@/components/projects/project-card";
import { NewProjectCard } from "@/components/projects/new-project";
import { ActivityList } from "@/components/projects/activity";
import { IconBoard, IconList } from "@/components/icons";
import { createProjectFromPortal } from "../../actions";
import { NewTaskForm } from "../../forms";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "", label: "Vue d'ensemble" },
  { key: "tableau", label: "Tableau" },
  { key: "liste", label: "Liste" },
] as const;

export default async function PortalWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string; projet?: string; etiquette?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, contact, clientIds } = await requireClient();
  // Seulement ses espaces ; projets en brouillon et leurs tâches exclus.
  const data = await getPortalWorkspace(db, clientIds, parsed.data);
  if (!data) notFound();
  const sp = await searchParams;
  const view = sp.vue === "tableau" || sp.vue === "liste" ? sp.vue : "";
  const { workspace, projects, members, tasks } = data;
  const [cards, feed] = view
    ? [[], []]
    : await Promise.all([projectCards(db, workspace.id, { portal: true }), activityFeed(db, { workspaceId: workspace.id }, { portal: true, limit: 12 })]);
  const shown = filterTasks(tasks, { projet: sp.projet, etiquette: sp.etiquette });
  const toValidate = tasks.filter((t) => t.status === "waiting_client");
  const mine = tasks.filter((t) => t.assignee_contact_id === contact.id && t.status !== "resolved" && t.status !== "canceled");
  const href = (q: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ vue: view || undefined, projet: sp.projet, etiquette: sp.etiquette, ...q }).filter(([, v]) => v) as [string, string][]);
    const s = next.toString();
    return `/portail/espaces/${workspace.id}${s ? `?${s}` : ""}`;
  };
  const labels = allLabels(tasks);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Breadcrumb items={[{ label: "Accueil", href: "/portail" }, { label: workspace.name }]} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="page-title flex items-center gap-3 text-[32px] leading-[38px]">
            <WorkspaceDot color={workspace.color} className="size-4" />
            {workspace.name}
          </h1>
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="flex -space-x-1.5">{members.slice(0, 6).map((m) => <Avatar key={m.id} name={m.name} />)}</span>
            {members.length} membre{members.length > 1 ? "s" : ""}
          </span>
        </div>
        <nav aria-label="Vues" className="tabs w-fit">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ vue: v.key || undefined, projet: undefined, etiquette: undefined })} aria-current={view === v.key ? "page" : undefined} className="tab inline-flex items-center gap-1.5">
              {v.key === "tableau" && <IconBoard />}
              {v.key === "liste" && <IconList />}
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      {!view && (
        <>
          {(toValidate.length > 0 || mine.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {toValidate.length > 0 && (
                <section aria-labelledby="valider-h" className="space-y-2">
                  <h2 id="valider-h" className="section-title text-accent">À valider par vous ({toValidate.length})</h2>
                  <ul className="space-y-2">{toValidate.map((t) => <li key={t.id}><TaskCardView task={t} href={`/portail/demandes/${t.id}`} viewer="client" /></li>)}</ul>
                </section>
              )}
              {mine.length > 0 && (
                <section aria-labelledby="miennes-h" className="space-y-2">
                  <h2 id="miennes-h" className="section-title">Assignées à vous ({mine.length})</h2>
                  <ul className="space-y-2">{mine.map((t) => <li key={t.id}><TaskCardView task={t} href={`/portail/demandes/${t.id}`} viewer="client" /></li>)}</ul>
                </section>
              )}
            </div>
          )}

          <section aria-labelledby="projets-h" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="projets-h" className="section-title">Projets ({cards.length})</h2>
              <p className="text-xs text-muted">Un projet regroupe les tâches d&apos;un même objectif : une application, une refonte, une campagne…</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => <ProjectCard key={c.id} project={c} href={`/portail/projets/${c.id}`} viewer="client" />)}
              <NewProjectCard workspaceId={workspace.id} action={createProjectFromPortal} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <section aria-label="Nouvelle tâche" className="card h-fit p-5">
              <NewTaskForm workspaceId={workspace.id} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
            </section>
            <section aria-labelledby="activite-h" className="min-w-0 space-y-2">
              <h2 id="activite-h" className="section-title">Activité récente</h2>
              <ActivityList events={feed} viewer="client" />
            </section>
          </div>
        </>
      )}

      {view && (
        <section aria-label="Tâches" className="space-y-3">
          {(projects.length > 0 || labels.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-sm">
              <Link href={href({ projet: undefined, etiquette: undefined })} className={`chip ${!sp.projet && !sp.etiquette ? "bg-accent/10 text-accent" : ""}`}>Tout</Link>
              {projects.map((p) => (
                <Link key={p.id} href={href({ projet: p.id, etiquette: undefined })} className={`chip ${sp.projet === p.id ? "bg-accent/10 text-accent" : ""}`}>{p.name}</Link>
              ))}
              {labels.map((l) => (
                <Link key={l} href={href({ etiquette: l, projet: undefined })} className={`chip ${sp.etiquette === l ? "bg-accent/10 text-accent" : ""}`}>#{l}</Link>
              ))}
            </div>
          )}
          {view === "tableau" ? (
            <Board tasks={shown} viewer="client" basePath="/portail/demandes" />
          ) : (
            <TaskList tasks={shown} viewer="client" basePath="/portail/demandes" />
          )}
        </section>
      )}
    </div>
  );
}
