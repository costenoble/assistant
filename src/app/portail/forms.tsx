"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRequest, replyToRequest, type PortalFormState } from "./actions";

function Error({ state }: { state: PortalFormState }) {
  return state?.error ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null;
}

export function NewRequestForm({
  clients,
  projects,
}: {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; client_id: string }[];
}) {
  const [state, action, pending] = useActionState<PortalFormState, FormData>(createRequest, null);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name;
  return (
    <form action={action} className="space-y-4">
      {clients.length > 1 && (
        <div className="space-y-1">
          <label htmlFor="client_id" className="text-sm font-medium">Entreprise concernée</label>
          <select id="client_id" name="client_id" className="input w-full" defaultValue="">
            <option value="">Choisissez…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {projects.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="project_id" className="text-sm font-medium">Projet concerné <span className="font-normal text-muted">(facultatif)</span></label>
          <select id="project_id" name="project_id" className="input w-full" defaultValue="">
            <option value="">Aucun en particulier</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{clients.length > 1 ? `${clientName(p.client_id)} · ${p.name}` : p.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="subject" className="text-sm font-medium">Objet</label>
        <input id="subject" name="subject" required maxLength={200} placeholder="Ex. Le formulaire de contact ne s'envoie plus" className="input w-full" />
      </div>
      <div className="space-y-1">
        <label htmlFor="body" className="text-sm font-medium">Votre demande</label>
        <textarea id="body" name="body" required rows={7} placeholder="Décrivez ce que vous constatez ou ce que vous souhaitez. Ajoutez l'adresse de la page concernée si besoin." className="input w-full resize-y" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="urgent" className="mt-1" />
        <span>C&apos;est bloquant <span className="text-muted">(votre site ou votre activité est empêché de fonctionner)</span></span>
      </label>
      <Error state={state} />
      <button className="btn-primary" disabled={pending}>{pending ? "Envoi…" : "Envoyer la demande"}</button>
    </form>
  );
}

export function RequestReplyForm({ ticketId, resolved }: { ticketId: string; resolved: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<PortalFormState, FormData>(replyToRequest, null);
  useEffect(() => {
    if (state?.sent) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label htmlFor="reply" className="text-sm font-medium">{resolved ? "Le problème persiste ? Répondez pour rouvrir la demande" : "Votre réponse"}</label>
      <textarea id="reply" name="body" required rows={4} className="input w-full resize-y" />
      <Error state={state} />
      <button className="btn-primary" disabled={pending}>{pending ? "Envoi…" : "Envoyer"}</button>
    </form>
  );
}
