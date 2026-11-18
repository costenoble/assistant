"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TICKET_STATUSES,
  WORKSPACE_COLORS,
  statusLabel,
  type TicketStatus,
  type WorkspaceColor,
} from "@/lib/db/types";
import { WORKSPACE_DOT } from "@/components/workspace/bits";
import { createWorkspace, createWorkspaceTask, deleteWorkspaceAction, updateWorkspaceAction, type FormState } from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <p className="text-sm text-danger" role="alert">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-ok" role="status">{state.message}</p>;
  return null;
}

export function ColorPicker({ name = "color", defaultValue = "blue" }: { name?: string; defaultValue?: WorkspaceColor }) {
  const [value, setValue] = useState<WorkspaceColor>(defaultValue);
  return (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">Couleur</legend>
      <input type="hidden" name={name} value={value} />
      {WORKSPACE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          aria-pressed={value === c}
          onClick={() => setValue(c)}
          className={`size-6 rounded-md ${WORKSPACE_DOT[c]} ring-offset-2 ring-offset-surface transition ${value === c ? "ring-2 ring-text" : "opacity-70 hover:opacity-100"}`}
        />
      ))}
    </fieldset>
  );
}

export function NewWorkspaceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkspace, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <label className="sr-only" htmlFor="ws-name">Nom de l&apos;espace</label>
        <input id="ws-name" name="name" required placeholder="Nom de l'espace… ex. Semaphors" className="input" />
        <label className="sr-only" htmlFor="ws-kind">Type</label>
        <select id="ws-kind" name="kind" defaultValue="client" className="input">
          <option value="client">Avec un client</option>
          <option value="internal">Interne (perso, SaaS)</option>
        </select>
        <button className="btn-primary h-10" disabled={pending}>Créer l&apos;espace</button>
      </div>
      <ColorPicker />
      <Feedback state={state} />
    </form>
  );
}

type Option = { id: string; name: string };

/** Création d'une tâche, repliée par défaut. */
export function NewTaskPanel({
  workspaceId,
  contacts,
  projects,
  defaultStatus = "open",
  defaultProject,
}: {
  workspaceId: string;
  contacts: Option[];
  projects: Option[];
  defaultStatus?: TicketStatus;
  defaultProject?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkspaceTask, null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Nouvelle tâche
      </button>
    );
  }
  return (
    <form ref={ref} action={action} className="card w-full space-y-3 p-4">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="sr-only" htmlFor="nt-subject">Titre</label>
      <input id="nt-subject" name="subject" required autoFocus maxLength={200} placeholder="Titre de la tâche" className="input w-full text-[15px]" />
      <label className="sr-only" htmlFor="nt-desc">Description</label>
      <textarea id="nt-desc" name="description" rows={3} placeholder="Description (facultatif)" className="input w-full resize-y" />
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Select label="Statut" name="status" defaultValue={defaultStatus}>
          {TICKET_STATUSES.filter((s) => s !== "canceled").map((s) => <option key={s} value={s}>{statusLabel("task", s, "admin")}</option>)}
        </Select>
        <Select label="Priorité" name="priority" defaultValue="none">
          {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </Select>
        <Select label="Assignée à" name="assignee" defaultValue="owner">
          <option value="owner">Moi</option>
          <option value="">Personne</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select label="Projet" name="project_id" defaultValue={defaultProject ?? ""}>
          <option value="">Aucun</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <label className="space-y-1 text-xs text-muted">
          Échéance
          <input type="date" name="due_on" className="input w-full" />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Étiquettes
          <input name="labels" placeholder="bug, ux" className="input w-full" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="notify" />
          Prévenir les membres par email
        </label>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setOpen(false)}>Fermer</button>
          <button className="btn-primary" disabled={pending}>{pending ? "…" : "Créer la tâche"}</button>
        </div>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-xs text-muted">
      {label}
      <select name={name} defaultValue={defaultValue} className="input w-full">{children}</select>
    </label>
  );
}

/** Filtres du tableau / de la liste, gardés dans l'URL. */
export function TaskFilters({ projects, contacts, labels }: { projects: Option[]; contacts: Option[]; labels: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const filter = (label: string, key: string, options: { value: string; label: string }[]) => (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={params.get(key) ?? ""} onChange={(e) => set(key, e.target.value)} className="input h-8 py-0 text-xs">
        <option value="">{label} : tous</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {projects.length > 0 && filter("Projet", "projet", projects.map((p) => ({ value: p.id, label: p.name })))}
      {filter("Assigné", "assigne", [{ value: "moi", label: "Moi" }, { value: "personne", label: "Personne" }, ...contacts.map((c) => ({ value: c.id, label: c.name }))])}
      {filter("Priorité", "priorite", TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] })))}
      {labels.length > 0 && filter("Étiquette", "etiquette", labels.map((l) => ({ value: l, label: l })))}
    </div>
  );
}

/** Réglages d'un espace : nom et couleur. */
export function WorkspaceSettingsForm({ workspaceId, name, color }: { workspaceId: string; name: string; color: WorkspaceColor }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateWorkspaceAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label className="block space-y-1 text-sm">
        <span className="block text-xs text-muted">Nom</span>
        <input name="name" defaultValue={name} required maxLength={120} className="input w-full max-w-md" />
      </label>
      <div className="space-y-1">
        <span className="block text-xs text-muted">Couleur</span>
        <ColorPicker defaultValue={color} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>Enregistrer</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Zone dangereuse : supprimer l'espace, après avoir retapé son nom. */
export function DeleteWorkspaceForm({ workspaceId, name, footprint }: { workspaceId: string; name: string; footprint: { projects: number; tickets: number; meetings: number; contacts: number } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteWorkspaceAction, null);
  const [typed, setTyped] = useState("");
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <p className="text-sm leading-6">
        Supprime définitivement l&apos;espace et tout ce qu&apos;il contient :{" "}
        <strong>
          {plural(footprint.projects, "projet", "projets")}, {plural(footprint.tickets, "tâche ou demande", "tâches et demandes")} (avec leurs échanges),{" "}
          {plural(footprint.meetings, "réunion", "réunions")}, {plural(footprint.contacts, "membre", "membres")}
        </strong>
        . Les membres perdent leur accès. Les mails reçus restent dans ta boîte. <strong>C&apos;est irréversible.</strong>
      </p>
      <label className="block space-y-1 text-sm">
        <span className="block text-xs text-muted">Pour confirmer, tape « {name} »</span>
        <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="input w-full max-w-md" />
      </label>
      <button className="btn border-critical/50 text-critical hover:bg-critical/10" disabled={pending || typed.trim() !== name}>
        {pending ? "Suppression…" : "Supprimer l'espace"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
