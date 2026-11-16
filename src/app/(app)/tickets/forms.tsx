"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { TICKET_STATUSES, statusLabel, type TicketKind, type TicketStatus } from "@/lib/db/types";
import { changeTicketStatus, replyToTicket, type ReplyState } from "./actions";

/**
 * Réponse de l'admin. Demande : Répondre / Répondre et résoudre.
 * Tâche : Commenter / Envoyer en validation / Marquer fait. Note interne dans les deux cas.
 */
export function ReplyForm({ ticketId, kind, canNotify }: { ticketId: string; kind: TicketKind; canNotify: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [internal, setInternal] = useState(false);
  const [state, action, pending] = useActionState<ReplyState, FormData>(replyToTicket, null);
  // Chaque envoi réussi renvoie un nouvel objet : on vide le formulaire.
  useEffect(() => {
    if (state?.message) {
      ref.current?.reset();
      setInternal(false);
    }
  }, [state]);
  const task = kind === "task";

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label htmlFor="reply" className="sr-only">{task ? "Commentaire" : "Réponse"}</label>
      <textarea
        id="reply"
        name="body"
        required
        rows={4}
        placeholder={internal ? "Note pour toi : jamais montrée au client" : task ? "Un commentaire, ou ce que tu as livré…" : "Ta réponse au client…"}
        className={`input w-full resize-y ${internal ? "border-high/50 bg-high/5" : ""}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="internal" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Note interne
        </label>
        <div className="flex flex-wrap gap-2">
          {internal ? (
            <button className="btn" disabled={pending}>Ajouter la note</button>
          ) : task ? (
            <>
              <button className="btn" name="intent" value="resolve" disabled={pending}>Marquer fait</button>
              <button className="btn" name="intent" value="submit" disabled={pending}>Envoyer en validation</button>
              <button className="btn-primary" name="intent" value="comment" disabled={pending}>Commenter</button>
            </>
          ) : (
            <>
              <button className="btn" name="intent" value="resolve" disabled={pending}>Répondre et résoudre</button>
              <button className="btn-primary" name="intent" value="reply" disabled={pending}>Répondre</button>
            </>
          )}
        </div>
      </div>
      {!internal && !canNotify && (
        <p className="text-xs text-muted">Personne côté client n&apos;a accès au portail : personne ne sera prévenu par email.</p>
      )}
      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state?.message && <p className="text-sm text-muted" role="status">{state.message}</p>}
    </form>
  );
}

export function TicketStatusSelect({ ticketId, kind, status }: { ticketId: string; kind: TicketKind; status: TicketStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Statut"
      className="input"
      value={status}
      disabled={pending}
      onChange={(e) => start(() => changeTicketStatus(ticketId, e.target.value))}
    >
      {TICKET_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(kind, s, "admin")}</option>)}
    </select>
  );
}
