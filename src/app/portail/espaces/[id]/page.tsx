import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalWorkspace } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { allLabels, filterTasks } from "@/lib/workspaces/filter";
import { Board } from "@/components/workspace/board";
import { TaskList } from "@/components/workspace/task-list";
import { TaskCardView } from "@/components/workspace/task-card";
import { Avatar, WorkspaceDot } from "@/components/workspace/bits";
import { IconBoard, IconList } from "@/components/icons";
import { NewTaskForm } from "../../forms";

export const dynamic = "force-dynamic";

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
  const view = sp.vue === "liste" ? "liste" : "tableau";
  const { workspace, projects, members, tasks } = data;
  const shown = filterTasks(tasks, { projet: sp.projet, etiquette: sp.etiquette });
  const toValidate = tasks.filter((t) => t.status === "waiting_client");
  const mine = tasks.filter((t) => t.assignee_contact_id === contact.id && t.status !== "resolved" && t.status !== "canceled");
  const href = (q: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ vue: sp.vue, projet: sp.projet, etiquette: sp.etiquette, ...q }).filter(([, v]) => v) as [string, string][]);
    const s = next.toString();
    return `/portail/espaces/${workspace.id}${s ? `?${s}` : ""}`;
  };
  const labels = allLabels(tasks);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/portail" className="text-sm text-muted hover:text-text">← Accueil</Link>
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
      </div>

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

      <section aria-label="Nouvelle tâche" className="card p-5">
        <NewTaskForm workspaceId={workspace.id} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </section>

      <section aria-label="Tâches" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Vues" className="tabs">
            <Link href={href({ vue: undefined })} aria-current={view === "tableau" ? "page" : undefined} className="tab inline-flex items-center gap-1.5"><IconBoard />Tableau</Link>
            <Link href={href({ vue: "liste" })} aria-current={view === "liste" ? "page" : undefined} className="tab inline-flex items-center gap-1.5"><IconList />Liste</Link>
          </nav>
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
        </div>
        {view === "tableau" ? (
          <Board tasks={shown} viewer="client" basePath="/portail/demandes" />
        ) : (
          <TaskList tasks={shown} viewer="client" basePath="/portail/demandes" />
        )}
      </section>
    </div>
  );
}
