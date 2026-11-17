"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type MeetingProposal, type TaskPriority } from "@/lib/db/types";
import { PriorityIcon } from "@/components/workspace/bits";
import { acceptProposalsAction, type MeetingFormState } from "../actions";

type Option = { id: string; name: string };
type Row = { keep: boolean; title: string; assignee: string; project_id: string; priority: TaskPriority };

/** Tâches proposées par Claude : tu choisis, tu retouches, tu crées. */
export function Proposals({
  meetingId,
  proposals,
  members,
  projects,
}: {
  meetingId: string;
  proposals: MeetingProposal[];
  members: Option[];
  projects: Option[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    proposals.map((p) => ({ keep: !p.ticket_id, title: p.title, assignee: p.assignee ?? "", project_id: p.project_id ?? "", priority: p.priority })),
  );
  const [state, setState] = useState<MeetingFormState>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const open = proposals.filter((p) => !p.ticket_id).length;
  const picked = rows.filter((r, i) => r.keep && !proposals[i]!.ticket_id).length;

  if (!proposals.length) return <p className="card px-4 py-6 text-center text-sm text-muted">Aucune tâche ne ressort de cette réunion.</p>;

  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-border">
        {proposals.map((p, i) => {
          const r = rows[i]!;
          if (p.ticket_id) {
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="text-ok" aria-hidden>✓</span>
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <Link href={`/tickets/${p.ticket_id}`} className="text-xs text-muted hover:text-text">Voir la tâche →</Link>
              </li>
            );
          }
          return (
            <li key={i} className={`space-y-2 px-4 py-3 ${r.keep ? "" : "opacity-55"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Garder « ${p.title} »`} checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} className="mt-2.5" />
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="sr-only" htmlFor={`p-title-${i}`}>Titre</label>
                  <input id={`p-title-${i}`} value={r.title} onChange={(e) => set(i, { title: e.target.value })} className="input w-full font-medium" />
                  {p.description && <p className="text-sm leading-6 text-muted">{p.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <PriorityIcon priority={r.priority} />
                    <select aria-label="Priorité" value={r.priority} onChange={(e) => set(i, { priority: e.target.value as TaskPriority })} className="input h-8 py-0 text-xs">
                      {TASK_PRIORITIES.map((x) => <option key={x} value={x}>{TASK_PRIORITY_LABELS[x]}</option>)}
                    </select>
                    <select aria-label="Assignée à" value={r.assignee} onChange={(e) => set(i, { assignee: e.target.value })} className="input h-8 py-0 text-xs">
                      <option value="owner">Moi</option>
                      <option value="">Personne</option>
                      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    {projects.length > 0 && (
                      <select aria-label="Projet" value={r.project_id} onChange={(e) => set(i, { project_id: e.target.value })} className="input h-8 py-0 text-xs">
                        <option value="">Sans projet</option>
                        {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    )}
                    {p.due_on && <span className="chip">échéance {new Date(`${p.due_on}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                    {p.labels.map((l) => <span key={l} className="chip">#{l}</span>)}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {open > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
          {state?.message && <p className="text-sm text-ok" role="status">{state.message}</p>}
          <button
            className="btn-primary"
            disabled={pending || picked === 0}
            onClick={() =>
              start(async () => {
                const picks = rows
                  .map((r, index) => ({ r, index }))
                  .filter(({ r, index }) => r.keep && !proposals[index]!.ticket_id && r.title.trim().length >= 2)
                  .map(({ r, index }) => ({
                    index,
                    edit: { title: r.title.trim(), assignee: r.assignee || null, project_id: r.project_id || null, priority: r.priority },
                  }));
                setState(await acceptProposalsAction(meetingId, picks));
              })
            }
          >
            {pending ? "Création…" : `Ajouter ${picked} tâche${picked > 1 ? "s" : ""} à l'espace`}
          </button>
        </div>
      )}
    </div>
  );
}
