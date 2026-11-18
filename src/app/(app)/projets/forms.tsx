"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  PROJECT_HEALTHS,
  PROJECT_HEALTH_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  WORKSPACE_COLORS,
  type ProjectHealth,
  type ProjectStatus,
  type WorkspaceColor,
} from "@/lib/db/types";
import { WORKSPACE_DOT } from "@/components/workspace/bits";
import { IconSparkle } from "@/components/icons";
import { setMeetingSharedAction } from "../reunions/actions";
import {
  addMilestoneAction,
  deleteMilestoneAction,
  draftUpdateAction,
  postUpdateAction,
  updateProjectAction,
  type ProjectFormState,
} from "./actions";

function Feedback({ state }: { state: ProjectFormState }) {
  if (state?.error) return <p className="text-sm text-danger" role="alert">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-ok" role="status">{state.message}</p>;
  return null;
}

/** Publier un point d'avancement (avec brouillon par Claude). */
export function UpdateComposer({ projectId, aiEnabled, draft }: { projectId: string; aiEnabled: boolean; draft: boolean }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(postUpdateAction, null);
  const [health, setHealth] = useState<ProjectHealth>("on_track");
  const [body, setBody] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [drafting, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const write = () =>
    start(async () => {
      setAiError(null);
      const r = await draftUpdateAction(projectId);
      if (!r.ok) return setAiError(r.error);
      setHealth(r.health);
      setBody(r.body);
    });
  return (
    <form
      ref={form}
      action={async (fd) => {
        await action(fd);
        setBody("");
      }}
      className="space-y-3"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="health" value={health} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Santé du projet" className="flex flex-wrap gap-1">
          {PROJECT_HEALTHS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={health === h}
              onClick={() => setHealth(h)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                health === h
                  ? h === "on_track" ? "border-ok bg-ok/12 text-ok" : h === "at_risk" ? "border-high bg-high/15 text-high" : "border-critical bg-critical/12 text-critical"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {PROJECT_HEALTH_LABELS[h]}
            </button>
          ))}
        </div>
        {aiEnabled && (
          <button type="button" className="btn-ghost h-8 text-xs" onClick={write} disabled={drafting}>
            <IconSparkle />
            {drafting ? "Claude rédige…" : "Rédiger avec Claude"}
          </button>
        )}
      </div>
      <label htmlFor="update-body" className="sr-only">Point d&apos;avancement</label>
      <textarea
        id="update-body"
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={body ? Math.min(12, body.split("\n").length + 2) : 4}
        placeholder="Ce qui a été fait, ce qui arrive, ce qui bloque ou ce que tu attends du client…"
        className="input w-full resize-y leading-6"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="notify" defaultChecked={!draft} disabled={draft} />
          {draft ? "Projet en brouillon : les membres ne le voient pas" : "Prévenir les membres par email"}
        </label>
        <button className="btn-primary" disabled={pending || body.trim().length < 3}>{pending ? "Publication…" : "Publier"}</button>
      </div>
      {aiError && <p className="text-sm text-danger" role="alert">{aiError}</p>}
      <Feedback state={state} />
    </form>
  );
}

export function MilestoneForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(addMilestoneAction, null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await action(fd);
        ref.current?.reset();
      }}
      className="space-y-1"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="ms-name">Nouveau jalon</label>
        <input id="ms-name" name="name" required maxLength={120} placeholder="Nouveau jalon… ex. « V1 en recette »" className="input h-9 min-w-0 flex-1 text-sm" />
        <label className="sr-only" htmlFor="ms-due">Date</label>
        <input id="ms-due" type="date" name="due_on" className="input h-9 w-40 text-sm" />
        <button className="btn h-9" disabled={pending}>Ajouter</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function DeleteMilestoneButton({ milestoneId, name }: { milestoneId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="text-xs text-muted hover:text-critical"
      disabled={pending}
      onClick={() => confirm(`Supprimer le jalon « ${name} » ? Ses tâches restent dans le projet.`) && start(() => deleteMilestoneAction(milestoneId))}
    >
      Supprimer
    </button>
  );
}

export function ProjectSettingsForm({
  project,
  leads,
}: {
  project: { id: string; name: string; color: WorkspaceColor; description: string | null; due_on: string | null; status: ProjectStatus; lead: string };
  leads: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(updateProjectAction, null);
  const [color, setColor] = useState<WorkspaceColor>(project.color);
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <input type="hidden" name="project_id" value={project.id} />
      <input type="hidden" name="color" value={color} />
      <label className="block space-y-1 text-sm">
        <span className="block text-xs text-muted">Nom</span>
        <input name="name" defaultValue={project.name} required maxLength={120} className="input w-full" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted">Couleur</legend>
        <div className="flex gap-1.5">
          {WORKSPACE_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-7 rounded-md ${WORKSPACE_DOT[c]} ring-offset-2 ring-offset-surface ${color === c ? "ring-2 ring-text" : "opacity-70 hover:opacity-100"}`} />
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="block text-xs text-muted">Description (visible des membres)</span>
        <textarea name="description" defaultValue={project.description ?? ""} rows={3} maxLength={2000} className="input w-full resize-y" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1 text-sm">
          <span className="block text-xs text-muted">Statut</span>
          <select name="status" defaultValue={project.status} className="input w-full">
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block text-xs text-muted">Responsable</span>
          <select name="lead" defaultValue={project.lead} className="input w-full">
            <option value="owner">Moi</option>
            <option value="">Personne</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block text-xs text-muted">Livraison prévue</span>
          <input type="date" name="due_on" defaultValue={project.due_on ?? ""} className="input w-full" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>Enregistrer</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Partager le compte rendu d'une réunion avec les membres (jamais la transcription). */
export function MeetingShareToggle({ meetingId, shared }: { meetingId: string; shared: boolean }) {
  const [on, setOn] = useState(shared);
  const [pending, start] = useTransition();
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          setOn(v);
          start(() => setMeetingSharedAction(meetingId, v));
        }}
      />
      Visible des membres
    </label>
  );
}
