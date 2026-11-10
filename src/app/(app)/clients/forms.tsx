"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addContact,
  addProject,
  createClientRecord,
  deleteContact,
  setPortalAccess,
  setProjectStatus,
  type FormState,
} from "./actions";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/db/types";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-danger" role="alert">{state.error}</p>;
  if (state.message) return <p className="text-sm text-muted" role="status">{state.message}</p>;
  return null;
}

export function CreateClientForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createClientRecord, null);
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[2fr_2fr_2fr_auto_auto]">
        <input name="name" required placeholder="Nom du client" className="input" />
        <input name="website" placeholder="Site (optionnel)" className="input" />
        <input name="email_domains" placeholder="Domaines mail : client.fr" className="input" />
        <select name="status" defaultValue="active" className="input">
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn-primary" disabled={pending}>Créer</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function AddContactForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContact.bind(null, clientId), null);
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
        <input name="full_name" required placeholder="Nom" className="input" />
        <input name="email" type="email" placeholder="Email" className="input" />
        <input name="phone" placeholder="Téléphone" className="input" />
        <input name="job_title" placeholder="Fonction" className="input" />
        <button className="btn-primary" disabled={pending}>Ajouter</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PortalAccessToggle({ contactId, enabled, hasEmail }: { contactId: string; enabled: boolean; hasEmail: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>(null);
  return (
    <div className="space-y-1 text-right">
      <button
        className={enabled ? "btn" : "btn-primary"}
        disabled={pending || (!enabled && !hasEmail)}
        title={!hasEmail ? "Ajoute un email pour ouvrir l'accès" : undefined}
        onClick={() => start(async () => setState(await setPortalAccess(contactId, !enabled)))}
      >
        {pending ? "…" : enabled ? "Retirer l'accès portail" : "Ouvrir l'accès portail"}
      </button>
      <Feedback state={state} />
    </div>
  );
}

export function DeleteContactButton({ contactId, clientId }: { contactId: string; clientId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Supprimer ce contact ? Son accès portail disparaît avec lui.")) {
          start(() => deleteContact(contactId, clientId));
        }
      }}
    >
      Supprimer
    </button>
  );
}

export function AddProjectForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addProject.bind(null, clientId), null);
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[2fr_3fr_auto_auto]">
        <input name="name" required placeholder="Nom du projet" className="input" />
        <input name="description" placeholder="Description (visible par le client)" className="input" />
        <input name="due_on" type="date" className="input" aria-label="Échéance" />
        <button className="btn-primary" disabled={pending}>Créer</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ProjectStatusSelect({ projectId, clientId, status }: { projectId: string; clientId: string; status: ProjectStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input py-1"
      defaultValue={status}
      disabled={pending}
      aria-label="Statut du projet"
      onChange={(e) => {
        const next = e.target.value;
        start(() => setProjectStatus(projectId, clientId, next));
      }}
    >
      {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
    </select>
  );
}
