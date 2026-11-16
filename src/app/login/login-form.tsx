"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-medium">Adresse email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="vous@entreprise.fr"
        className="input w-full"
      />
      <button type="submit" disabled={pending} className="btn-primary h-10 w-full">
        {pending ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
      {state && (
        <p className={`rounded-lg px-3 py-2.5 text-sm ${state.ok ? "bg-ok/10 text-ok" : "bg-critical/10 text-critical"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
