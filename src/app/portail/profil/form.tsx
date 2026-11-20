"use client";

import { useActionState } from "react";
import { updateMyProfile } from "../actions";

export function ProfileForm({ name, jobTitle, phone, email, notifyEmail }: { name: string; jobTitle: string | null; phone: string | null; email: string; notifyEmail: boolean }) {
  const [state, action, pending] = useActionState(updateMyProfile, null);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Nom affiché</span>
          <input name="full_name" defaultValue={name} required minLength={2} maxLength={120} className="input w-full" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Fonction</span>
          <input name="job_title" defaultValue={jobTitle ?? ""} maxLength={120} placeholder="Ex. Responsable produit" className="input w-full" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Téléphone</span>
          <input name="phone" defaultValue={phone ?? ""} maxLength={40} inputMode="tel" placeholder="06 12 34 56 78" className="input w-full" />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Email de connexion</span>
          <input value={email} readOnly disabled className="input w-full opacity-70" />
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-border p-4 text-sm">
        <input type="checkbox" name="notify_email" defaultChecked={notifyEmail} className="mt-0.5 size-4" />
        <span>
          <span className="block font-medium">Recevoir les notifications par email</span>
          <span className="block text-muted">Tâches à valider, réponses, tâches qui vous sont assignées, points d&apos;avancement.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
        {state?.message && <p className="pop-in text-sm text-ok" role="status">{state.message}</p>}
      </div>
    </form>
  );
}
