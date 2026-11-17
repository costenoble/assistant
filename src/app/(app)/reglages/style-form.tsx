"use client";

import { useActionState } from "react";
import { saveWritingStyleAction } from "../assistant/actions";

const EXAMPLE = `Je tutoie Marc et Julie (Semaphors), je vouvoie mes clients freelance.
Phrases courtes, directes, sans formule pompeuse.
Signature : « Ryan » pour les proches, « Ryan Costenoble — développeur » pour les nouveaux contacts.`;

export function WritingStyleForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(saveWritingStyleAction, null);
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="style" className="sr-only">Ton et signature</label>
      <textarea id="style" name="style" defaultValue={initial} rows={5} maxLength={4000} placeholder={EXAMPLE} className="input w-full resize-y leading-6" />
      <div className="flex items-center justify-between gap-3">
        {state?.message ? <p className="text-sm text-ok" role="status">{state.message}</p> : <span />}
        <button className="btn" disabled={pending}>Enregistrer</button>
      </div>
    </form>
  );
}
