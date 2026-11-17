import Link from "next/link";
import { TICKET_STATUSES, statusLabel } from "@/lib/db/types";
import type { TaskCard } from "@/lib/workspaces/queries";
import { Avatar, DueDate, LabelChip, PriorityIcon } from "./bits";
import { assigneeName, type Viewer } from "./task-card";

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;

/** Vue liste façon Linear : groupée par statut, triée par priorité. Les groupes vides sont masqués. */
export function TaskList({ tasks, viewer, basePath }: { tasks: TaskCard[]; viewer: Viewer; basePath: string }) {
  const groups = TICKET_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.position - b.position),
  })).filter((g) => g.tasks.length);

  if (!groups.length) return <p className="card px-4 py-10 text-center text-sm text-muted">Aucune tâche.</p>;

  return (
    <div className="card overflow-hidden">
      {groups.map((g) => (
        <section key={g.status} aria-label={statusLabel("task", g.status, viewer)}>
          <h3 className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2 text-xs font-semibold text-muted">
            {statusLabel("task", g.status, viewer)}
            <span className="tabular-nums">{g.tasks.length}</span>
          </h3>
          <ul className="divide-y divide-border border-b border-border last:border-b-0">
            {g.tasks.map((t) => {
              const who = assigneeName(t, viewer);
              const done = t.status === "resolved" || t.status === "canceled";
              return (
                <li key={t.id}>
                  <Link href={`${basePath}/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-surface-2/50">
                    <PriorityIcon priority={t.priority} />
                    <span className="w-12 shrink-0 text-xs tabular-nums text-muted">#{t.number}</span>
                    <span className={`min-w-0 flex-1 truncate ${done ? "text-muted line-through decoration-muted/50" : "font-medium"}`}>{t.subject}</span>
                    <span className="hidden items-center gap-1.5 sm:flex">
                      {t.labels.map((l) => <LabelChip key={l} label={l} />)}
                      {t.project_name && <span className="chip">{t.project_name}</span>}
                    </span>
                    {t.due_on && <DueDate dueOn={t.due_on} done={done} />}
                    {who ? <Avatar name={who} size="size-5" owner={t.assigned_to_owner && !t.assignee_name} /> : <span className="size-5" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
