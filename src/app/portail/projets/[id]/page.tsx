import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalProject } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { activityFeed, getProjectPage } from "@/lib/projects/overview";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { formatDay } from "@/lib/time/paris";
import { Breadcrumb } from "@/components/projects/breadcrumb";
import { HealthBadge, Progress, shortDay } from "@/components/projects/bits";
import { MonthCalendar, parseMonth } from "@/components/projects/calendar";
import { ActivityList } from "@/components/projects/activity";
import { getOwnerProfile } from "@/lib/profile/service";
import { avatarUrl } from "@/lib/profile/avatar-url";
import { Board } from "@/components/workspace/board";
import { TaskList } from "@/components/workspace/task-list";
import { TaskCardView } from "@/components/workspace/task-card";
import { WorkspaceDot } from "@/components/workspace/bits";
import { IconBoard, IconList } from "@/components/icons";
import { NewTaskForm } from "../../forms";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "apercu", label: "Aperçu" },
  { key: "tableau", label: "Tableau" },
  { key: "liste", label: "Liste" },
  { key: "calendrier", label: "Calendrier" },
  { key: "reunions", label: "Réunions" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function PortalProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vue?: string; mois?: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, clientIds } = await requireClient();
  // Contrôle d'accès : un projet de ses espaces, hors brouillon.
  if (!(await getPortalProject(db, clientIds, parsed.data))) notFound();
  const data = await getProjectPage(db, parsed.data, { portal: true });
  if (!data) notFound();
  const sp = await searchParams;
  const owner = await getOwnerProfile(db);
  const team = { name: owner.name ?? "Notre équipe", avatar: avatarUrl("moi", owner.avatar_key) };
  const tab: Tab = TABS.find((t) => t.key === sp.vue)?.key ?? "apercu";
  const { project: p, workspace, milestones, updates, tasks, meetings, progress } = data;
  const feed = tab === "apercu" ? await activityFeed(db, { workspaceId: workspace.id, projectId: p.id }, { portal: true, limit: 12 }) : [];
  const href = (t: Tab, extra = "") => `/portail/projets/${p.id}${t === "apercu" ? "" : `?vue=${t}`}${extra}`;
  const lead = data.lead === "owner" ? "Notre équipe" : data.lead;
  const last = updates[0];
  const toValidate = tasks.filter((t) => t.status === "waiting_client");
  const month = parseMonth(sp.mois);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Accueil", href: "/portail" }, { label: workspace.name, href: `/portail/espaces/${workspace.id}` }, { label: p.name }]} />

      <header className="space-y-3">
        <h1 className="page-title flex items-center gap-3 text-[32px] leading-[38px]">
          <WorkspaceDot color={p.color} className="size-4" />
          <span className="[overflow-wrap:anywhere]">{p.name}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{PROJECT_STATUS_LABELS[p.status]}</span>
          {last && <HealthBadge health={last.health} />}
          {lead && <span>Responsable : {lead}</span>}
          {p.due_on && <span>· Livraison prévue le {shortDay(p.due_on)}</span>}
        </div>
        <Progress done={progress.done} total={progress.total} className="max-w-md" />
      </header>

      <nav aria-label="Vues du projet" className="tabs w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} aria-current={tab === t.key ? "page" : undefined} className="tab inline-flex shrink-0 items-center gap-1.5">
            {t.key === "tableau" && <IconBoard />}
            {t.key === "liste" && <IconList />}
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "apercu" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-6">
            {p.description && <p className="max-w-3xl whitespace-pre-line text-[15px] leading-7 text-muted">{p.description}</p>}

            {toValidate.length > 0 && (
              <section aria-labelledby="valider-h" className="space-y-2">
                <h2 id="valider-h" className="section-title text-accent">À valider par vous ({toValidate.length})</h2>
                <ul className="grid gap-2 sm:grid-cols-2">{toValidate.map((t) => <li key={t.id}><TaskCardView task={t} href={`/portail/demandes/${t.id}`} viewer="client" /></li>)}</ul>
              </section>
            )}

            {last && (
              <section aria-labelledby="update-h" className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="update-h" className="section-title">Dernier point d&apos;avancement</h2>
                  <span className="text-xs text-muted">{formatDay(last.created_at)}</span>
                </div>
                <HealthBadge health={last.health} />
                <p className="whitespace-pre-line text-[15px] leading-7">{last.body}</p>
                {updates.length > 1 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">Points précédents ({updates.length - 1})</summary>
                    <ul className="mt-3 space-y-3">
                      {updates.slice(1).map((u) => (
                        <li key={u.id} className="space-y-1 border-l-2 border-border pl-3">
                          <div className="flex items-center gap-2 text-xs text-muted"><HealthBadge health={u.health} />{formatDay(u.created_at)}</div>
                          <p className="whitespace-pre-line text-muted">{u.body}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {milestones.length > 0 && (
              <section aria-labelledby="ms-h" className="card space-y-3 p-5">
                <h2 id="ms-h" className="section-title">Étapes</h2>
                <ul className="space-y-3">
                  {milestones.map((m) => (
                    <li key={m.id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{m.name}</span>
                        {m.due_on && <span className="text-xs text-muted">{shortDay(m.due_on)}</span>}
                      </div>
                      <Progress done={m.done} total={m.total} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Nouvelle tâche" className="card p-5">
              <NewTaskForm workspaceId={workspace.id} projectId={p.id} />
            </section>
          </div>
          <aside className="min-w-0 space-y-2">
            <h2 className="section-title">Activité</h2>
            <ActivityList events={feed} viewer="client" team={team} empty="Rien encore sur ce projet." />
          </aside>
        </div>
      )}

      {tab === "tableau" && <Board tasks={tasks} viewer="client" basePath="/portail/demandes" />}
      {tab === "liste" && <TaskList tasks={tasks} viewer="client" basePath="/portail/demandes" />}
      {tab === "calendrier" && (
        <MonthCalendar tasks={tasks} year={month.year} month={month.month} taskHref="/portail/demandes" monthHref={(m) => href("calendrier", `&mois=${m}`)} />
      )}
      {tab === "reunions" &&
        (meetings.length ? (
          <ul className="space-y-4">
            {meetings.map((m) => (
              <li key={m.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold">{m.title}</h2>
                  <span className="text-xs text-muted">{formatDay(m.started_at)}</span>
                </div>
                {m.summary && <p className="whitespace-pre-line text-[15px] leading-7">{m.summary}</p>}
                {m.decisions.length > 0 && (
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Décisions</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6">{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="card px-4 py-8 text-center text-sm text-muted">Aucun compte rendu de réunion partagé pour ce projet.</p>
        ))}
    </div>
  );
}
