"use client";

import { useState, useTransition } from "react";
import { ideaToTaskAction, projectIdeasAction } from "@/app/(app)/assistant/actions";
import type { Idea } from "@/lib/ai/assistant";
import { IconSparkle } from "../icons";

const KIND: Record<Idea["kind"], { label: string; tone: string }> = {
  next_step: { label: "Prochaine étape", tone: "text-accent" },
  improvement: { label: "Amélioration", tone: "text-ok" },
  risk: { label: "Risque", tone: "text-high" },
};

/** Idées pour un projet (ou tout l'espace) ; chacune peut devenir une tâche du backlog. */
export function IdeasPanel({ workspaceId, projects }: { workspaceId: string; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [ideas, setIdeas] = useState<(Idea & { added?: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      setError(null);
      const res = await projectIdeasAction(workspaceId, projectId || null);
      if (res.ok) setIdeas(res.value);
      else setError(res.error);
    });
  const add = (i: number) =>
    start(async () => {
      const idea = ideas![i]!;
      const res = await ideaToTaskAction(workspaceId, projectId || null, { title: idea.title, why: idea.why });
      if (!res.ok) return setError(res.error);
      setIdeas((xs) => xs!.map((x, j) => (j === i ? { ...x, added: res.value } : x)));
    });

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <IconSparkle />
        Idées
      </button>
    );
  }
  return (
    <section aria-label="Idées de l'assistant" className="card w-full space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><IconSparkle /> Idées pour</h2>
        <label htmlFor="ideas-project" className="sr-only">Projet</label>
        <select id="ideas-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input h-9 py-0 text-sm">
          <option value="">Tout l&apos;espace</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" className="btn-primary h-9" onClick={ask} disabled={pending}>
          {pending && !ideas ? "Claude réfléchit…" : ideas ? "Nouvelles idées" : "Proposer"}
        </button>
        <button type="button" className="btn-ghost ml-auto h-9" onClick={() => setOpen(false)}>Fermer</button>
      </div>
      {!ideas && !pending && (
        <p className="text-sm text-muted">Claude lit les tâches ouvertes et faites et les dernières réunions, puis propose des prochaines étapes, des améliorations et des risques à traiter.</p>
      )}
      {ideas && (
        <ul className="divide-y divide-border">
          {ideas.map((idea, i) => (
            <li key={i} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${KIND[idea.kind].tone}`}>{KIND[idea.kind].label}</p>
                <p className="font-medium">{idea.title}</p>
                <p className="text-sm leading-6 text-muted">{idea.why}</p>
              </div>
              {idea.added ? (
                <span className="text-xs text-ok">Ajoutée (#{idea.added})</span>
              ) : (
                <button type="button" className="btn h-8 text-xs" onClick={() => add(i)} disabled={pending}>Ajouter au backlog</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
