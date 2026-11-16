"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/db/types";
import { changeTicketStatus, replyToTicket, type ReplyState } from "./actions";

export function ReplyForm({ ticketId, canNotify }: { ticketId: string; canNotify: boolean }) {
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

  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label htmlFor="reply" className="sr-only">Réponse</label>
      <textarea
        id="reply"
        name="body"
        required
        rows={5}
        placeholder={internal ? "Note pour toi : jamais montrée au client" : "Ta réponse au client…"}
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
          ) : (
            <>
              <button className="btn" name="intent" value="resolve" disabled={pending}>Répondre et résoudre</button>
              <button className="btn-primary" name="intent" value="reply" disabled={pending}>Répondre</button>
            </>
          )}
        </div>
      </div>
      {!internal && !canNotify && (
        <p className="text-xs text-muted">Ce contact n&apos;a pas (ou plus) d&apos;accès portail : il ne sera pas prévenu par email.</p>
      )}
      {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      {state?.message && <p className="text-sm text-muted" role="status">{state.message}</p>}
    </form>
  );
}

export function TicketStatusSelect({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Statut du ticket"
      className="input"
      value={status}
      disabled={pending}
      onChange={(e) => start(() => changeTicketStatus(ticketId, e.target.value))}
    >
      {TICKET_STATUSES.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
    </select>
  );
}
