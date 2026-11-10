"use client";

import { useActionState } from "react";
import { createSaasSource, type CreateSourceState } from "../actions";
import { CONTEXT_LABELS, ITEM_CONTEXTS } from "@/lib/db/types";

export function CreateSourceForm() {
  const [state, action, pending] = useActionState<CreateSourceState, FormData>(createSaasSource, null);
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input name="name" required placeholder="Nom (ex. Vigie SEO)" className="input" />
        <input name="slug" required placeholder="slug (ex. vigie-seo)" pattern="[a-z0-9-]{2,40}" className="input" />
        <select name="context" defaultValue="saas" className="input">
          {ITEM_CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABELS[c]}</option>)}
        </select>
        <button className="btn-primary" disabled={pending}>Créer la clé</button>
      </form>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.key && <KeyReveal value={state.key} />}
    </div>
  );
}

export function KeyReveal({ value }: { value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-high/40 bg-high/10 p-3">
      <p className="text-xs font-medium text-high">Copie cette clé maintenant : elle ne sera plus jamais affichée.</p>
      <code className="block break-all text-sm">{value}</code>
    </div>
  );
}
