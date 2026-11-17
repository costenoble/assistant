import Link from "next/link";
import type { TaskCard } from "@/lib/workspaces/queries";
import { Avatar, DueDate, LabelChip, PriorityIcon } from "./bits";
import { IconComment } from "../icons";

export type Viewer = "admin" | "client";

/** Qui a la tâche, vu par l'admin (« Toi ») ou par le client (« Notre équipe »). */
export function assigneeName(t: Pick<TaskCard, "assigned_to_owner" | "assignee_name">, viewer: Viewer) {
  if (t.assignee_name) return t.assignee_name;
  if (t.assigned_to_owner) return viewer === "admin" ? "Toi" : "Notre équipe";
  return null;
}

/** Carte du tableau. */
export function TaskCardView({ task, href, viewer }: { task: TaskCard; href: string; viewer: Viewer }) {
  const who = assigneeName(task, viewer);
  const done = task.status === "resolved" || task.status === "canceled";
  return (
    <Link href={href} className="block space-y-2 rounded-lg border border-border bg-surface p-3 transition hover:border-border-strong">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="tabular-nums">#{task.number}{task.project_name ? ` · ${task.project_name}` : ""}</span>
        <PriorityIcon priority={task.priority} />
      </div>
      <p className={`text-[13px] font-medium leading-5 [overflow-wrap:anywhere] ${done ? "text-muted line-through decoration-muted/50" : ""}`}>{task.subject}</p>
      {(task.labels.length > 0 || task.due_on || who || task.replies > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.labels.map((l) => <LabelChip key={l} label={l} />)}
          {task.due_on && <DueDate dueOn={task.due_on} done={done} />}
          <span className="ml-auto flex items-center gap-1.5">
            {task.replies > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted" title={`${task.replies} commentaire(s)`}>
                <IconComment className="size-3" />
                {task.replies}
              </span>
            )}
            {who && <Avatar name={who} size="size-5" owner={task.assigned_to_owner && !task.assignee_name} />}
          </span>
        </div>
      )}
    </Link>
  );
}
