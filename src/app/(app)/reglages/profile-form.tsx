"use client";

import { useActionState } from "react";
import { saveOwnerNameAction } from "../assistant/actions";

/** Ton nom tel que les membres le voient (à la place de « Notre équipe »). */
export function OwnerNameForm({ name }: { name: string | null }) {
  const [state, action, pending] = useActionState(saveOwnerNameAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="block min-w-60 flex-1 space-y-1 text-sm">
        <span className="block text-xs text-muted">Nom affiché aux membres</span>
        <input name="name" defaultValue={name ?? ""} maxLength={80} placeholder="Ex. Ryan Costenoble" className="input w-full" />
      </label>
      <button className="btn" disabled={pending}>Enregistrer</button>
      {state?.message && <p className="w-full text-sm text-ok" role="status">{state.message}</p>}
    </form>
  );
}
