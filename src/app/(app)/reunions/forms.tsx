"use client";

import { useActionState, useState } from "react";
import { startMeeting, type MeetingFormState } from "./actions";

type Ws = { id: string; name: string; projects: { id: string; name: string }[] };

export function StartMeetingForm({ workspaces, defaultWorkspace }: { workspaces: Ws[]; defaultWorkspace?: string }) {
  const [state, action, pending] = useActionState<MeetingFormState, FormData>(startMeeting, null);
  const [wsId, setWsId] = useState(defaultWorkspace && workspaces.some((w) => w.id === defaultWorkspace) ? defaultWorkspace : (workspaces[0]?.id ?? ""));
  const projects = workspaces.find((w) => w.id === wsId)?.projects ?? [];
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <label className="space-y-1 text-xs text-muted">
          Espace
          <select name="workspace_id" value={wsId} onChange={(e) => setWsId(e.target.value)} className="input w-full" required>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Projet
          <select key={wsId} name="project_id" defaultValue="" className="input w-full">
            <option value="">Aucun en particulier</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Titre (facultatif, Claude en proposera un)
          <input name="title" maxLength={120} placeholder="Point hebdo" className="input w-full" />
        </label>
        <button className="btn-primary h-10 self-end" disabled={pending || !wsId}>{pending ? "…" : "Démarrer la réunion"}</button>
      </div>
      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
    </form>
  );
}
