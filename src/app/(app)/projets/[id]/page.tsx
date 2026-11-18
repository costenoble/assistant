import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { aiAvailable } from "@/lib/ai/claude";
import { activityFeed, getProjectPage } from "@/lib/projects/overview";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { formatDay } from "@/lib/time/paris";
import { Breadcrumb } from "@/components/projects/breadcrumb";
import { HealthBadge, Progress, shortDay } from "@/components/projects/bits";
import { MonthCalendar, parseMonth } from "@/components/projects/calendar";
import { ActivityList } from "@/components/projects/activity";
import { Board } from "@/components/workspace/board";
import { TaskList } from "@/components/workspace/task-list";
import { WorkspaceDot } from "@/components/workspace/bits";
import { IconBoard, IconList, IconLock } from "@/components/icons";
import { moveTaskAction } from "../../espaces/actions";
import { NewTaskPanel } from "../../espaces/forms";
import { DeleteMilestoneButton, MeetingShareToggle, MilestoneForm, ProjectSettingsForm, UpdateComposer } from "../forms";

export const dynamic = "force-dynamic";
// « Rédiger avec Claude » : jusqu'à une vingtaine de secondes.
export const maxDuration = 120;

const TABS = [
  { key: "apercu", label: "Aperçu" },
  { key: "tableau", label: "Tableau" },
  { key: "liste", label: "Liste" },
  { key: "calendrier", label: "Calendrier" },
  { key: "reunions", label: "Réunions" },
  { key: "reglages", label: "Réglages" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vue?: string; mois?: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const data = await getProjectPage(db, parsed.data, { portal: false });
  if (!data) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === sp.vue)?.key ?? "apercu";
  const { project: p, workspace, milestones, updates, tasks, meetings, members, progress } = data;
  const feed = tab === "apercu" ? await activityFeed(db, { workspaceId: workspace.id, projectId: p.id }, { portal: false, limit: 15 }) : [];
  const href = (t: Tab, extra = "") => `/projets/${p.id}${t === "apercu" ? "" : `?vue=${t}`}${extra}`;
  const lead = data.lead === "owner" ? "Toi" : data.lead;
  const last = updates[0];
  const month = parseMonth(sp.mois);

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Espaces", href: "/espaces" }, { label: workspace.name, href: `/espaces/${workspace.id}` }, { label: p.name }]} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="page-title flex items-center gap-3">
            <WorkspaceDot color={p.color} className="size-4" />
            <span className="[overflow-wrap:anywhere]">{p.name}</span>
            {p.status === "draft" && <IconLock className="text-high" />}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="chip">{PROJECT_STATUS_LABELS[p.status]}</span>
            {last && <HealthBadge health={last.health} />}
            {lead && <span>Resp. {lead}</span>}
            {p.due_on && <span>· Livraison {shortDay(p.due_on)}</span>}
          </div>
          <Progress done={progress.done} total={progress.total} className="max-w-sm" />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/reunions?espace=${workspace.id}`} className="btn">Lancer une réunion</Link>
          <NewTaskPanel workspaceId={workspace.id} contacts={members} projects={[{ id: p.id, name: p.name }]} defaultProject={p.id} />
        </div>
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
            {p.description && <p className="max-w-3xl whitespace-pre-line text-[15px] leading-7">{p.description}</p>}

            <section aria-labelledby="update-h" className="card space-y-4 p-5">
              <h2 id="update-h" className="section-title">Point d&apos;avancement</h2>
              {last && (
                <div className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <HealthBadge health={last.health} />
                    <span className="text-xs text-muted">{formatDay(last.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6">{last.body}</p>
                </div>
              )}
              <UpdateComposer projectId={p.id} aiEnabled={aiAvailable()} draft={p.status === "draft"} />
            </section>

            <section aria-labelledby="ms-h" className="card space-y-3 p-5">
              <h2 id="ms-h" className="section-title">Jalons</h2>
              {milestones.length ? (
                <ul className="space-y-3">
                  {milestones.map((m) => (
                    <li key={m.id} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{m.name}</span>
                        <span className="flex items-center gap-3 text-xs text-muted">
                          {m.due_on && <span>{shortDay(m.due_on)}</span>}
                          <DeleteMilestoneButton milestoneId={m.id} name={m.name} />
                        </span>
                      </div>
                      <Progress done={m.done} total={m.total} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Découpe le projet en étapes (« Maquettes validées », « V1 en recette »…), puis rattache les tâches à une étape depuis leur page.</p>
              )}
              <MilestoneForm projectId={p.id} />
            </section>

            {updates.length > 1 && (
              <section aria-labelledby="hist-h" className="space-y-2">
                <h2 id="hist-h" className="section-title">Points précédents</h2>
                <ul className="card divide-y divide-border">
                  {updates.slice(1).map((u) => (
                    <li key={u.id} className="space-y-1 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <HealthBadge health={u.health} />
                        <span className="text-xs text-muted">{formatDay(u.created_at)}</span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-line text-sm text-muted">{u.body}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <aside className="min-w-0 space-y-2">
            <h2 className="section-title">Activité</h2>
            <ActivityList events={feed} viewer="admin" empty="Rien encore : ajoute une tâche pour démarrer." />
          </aside>
        </div>
      )}

      {tab === "tableau" && <Board tasks={tasks} viewer="admin" basePath="/tickets" onMove={moveTaskAction} />}
      {tab === "liste" && <TaskList tasks={tasks} viewer="admin" basePath="/tickets" />}
      {tab === "calendrier" && (
        <MonthCalendar tasks={tasks} year={month.year} month={month.month} taskHref="/tickets" monthHref={(m) => href("calendrier", `&mois=${m}`)} />
      )}

      {tab === "reunions" && (
        <section className="space-y-3">
          {meetings.length ? (
            <ul className="card divide-y divide-border">
              {meetings.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <Link href={`/reunions/${m.id}`} className="min-w-0 flex-1 space-y-0.5 hover:underline">
                    <span className="block font-medium">{m.title}</span>
                    <span className="block text-xs text-muted">{formatDay(m.started_at)}{m.status !== "ready" ? " · pas encore analysée" : ""}</span>
                  </Link>
                  {m.status === "ready" && <MeetingShareToggle meetingId={m.id} shared={m.shared} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="card px-4 py-6 text-center text-sm text-muted">Aucune réunion rattachée à ce projet.</p>
          )}
          <p className="text-xs text-muted">Un compte rendu « visible des membres » montre son résumé et ses décisions dans l&apos;espace membre ; la transcription reste privée.</p>
        </section>
      )}

      {tab === "reglages" && (
        <section className="card p-5">
          <ProjectSettingsForm
            project={{ id: p.id, name: p.name, color: p.color, description: p.description, due_on: p.due_on, status: p.status, lead: p.lead_contact_id ?? (p.lead_is_owner ? "owner" : "") }}
            leads={members}
          />
        </section>
      )}
    </div>
  );
}
