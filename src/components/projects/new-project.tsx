"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { WORKSPACE_COLORS, type WorkspaceColor } from "@/lib/db/types";
import { WORKSPACE_DOT } from "../workspace/bits";
import { IconPlus } from "../icons";

type State = { error?: string } | null;

/**
 * « + Nouveau projet » : une carte qui ouvre une fenêtre (nom, couleur,
 * description, livraison). L'action est fournie par la page (admin ou membre).
 */
export function NewProjectCard({
  workspaceId,
  action,
  leads,
}: {
  workspaceId: string;
  action: (prev: State, fd: FormData) => Promise<State>;
  /** Choix du responsable (admin seulement). */
  leads?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<WorkspaceColor>("blue");
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted transition hover:border-accent hover:text-accent"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2"><IconPlus /></span>
        Nouveau projet
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="new-project-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/50"
      >
        <form action={formAction} className="space-y-4 p-5">
          <h2 id="new-project-title" className="font-display text-lg font-semibold">Nouveau projet</h2>
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="color" value={color} />
          <label className="block space-y-1 text-sm">
            <span className="block text-xs text-muted">Nom</span>
            <input name="name" required maxLength={120} autoFocus placeholder="Ex. Application de planning" className="input w-full" />
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
            <span className="block text-xs text-muted">Description (facultatif)</span>
            <textarea name="description" rows={3} maxLength={2000} placeholder="L'objectif du projet, en une ou deux phrases" className="input w-full resize-y" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="block text-xs text-muted">Livraison prévue (facultatif)</span>
              <input type="date" name="due_on" className="input w-full" />
            </label>
            {leads && (
              <label className="block space-y-1 text-sm">
                <span className="block text-xs text-muted">Responsable</span>
                <select name="lead" defaultValue="owner" className="input w-full">
                  <option value="owner">Moi</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>
            <button className="btn-primary" disabled={pending}>{pending ? "Création…" : "Créer le projet"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
