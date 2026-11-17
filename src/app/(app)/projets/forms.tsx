"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProjectTask, type TaskFormState } from "./actions";

export function NewTaskForm({ projectId, canShare }: { projectId: string; canShare: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<TaskFormState, FormData>(createProjectTask, null);
  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      <label htmlFor="task-subject" className="sr-only">Titre de la tâche</label>
      <input id="task-subject" name="subject" required maxLength={200} placeholder="Nouvelle tâche… ex. « Livrer l'export CSV »" className="input w-full" />
      <label htmlFor="task-body" className="sr-only">Détail</label>
      <textarea id="task-body" name="body" rows={2} placeholder="Détail (facultatif)" className="input w-full resize-y" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {canShare ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="share" defaultChecked={false} />
            Prévenir le client par email
          </label>
        ) : (
          <span className="text-xs text-muted">Visible du client dès que le projet n&apos;est plus en brouillon.</span>
        )}
        <button className="btn-primary" disabled={pending}>Ajouter la tâche</button>
      </div>
      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state?.message && <p className="text-sm text-muted" role="status">{state.message}</p>}
    </form>
  );
}
