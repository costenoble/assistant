"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, null);
  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="vous@entreprise.fr"
        className="input w-full"
      />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
      {state && (
        <p className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
