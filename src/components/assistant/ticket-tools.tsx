"use client";

import { useState, useTransition } from "react";
import { createSubtasksAction, draftTicketReplyAction, splitTaskAction } from "@/app/(app)/assistant/actions";
import { IconSparkle } from "../icons";

/** Au-dessus du champ de réponse d'un ticket : brouillon par Claude, versé dans le champ. */
export function DraftReplyBar({ ticketId, onDraft }: { ticketId: string; onDraft: (text: string) => void }) {
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setError(null);
      const res = await draftTicketReplyAction(ticketId, hint);
      if (res.ok) onDraft(res.value);
      else setError(res.error);
    });
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <label htmlFor="ticket-hint" className="sr-only">Consigne pour Claude</label>
        <input
          id="ticket-hint"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), run())}
          placeholder="Consigne facultative pour le brouillon : « annoncer la livraison demain »…"
          className="input h-9 min-w-0 flex-1 text-sm"
        />
        <button type="button" className="btn h-9" onClick={run} disabled={pending}>
          <IconSparkle />
          {pending ? "Claude rédige…" : "Proposer une réponse"}
        </button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

type Sub = { title: string; description: string; keep: boolean };

/** Découpe une tâche floue en sous-tâches, que tu coches avant de les créer. */
export function SplitTaskPanel({ ticketId }: { ticketId: string }) {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const propose = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const res = await splitTaskAction(ticketId);
      if (res.ok) setSubs(res.value.map((s) => ({ ...s, keep: true })));
      else setError(res.error);
    });
  const create = () =>
    start(async () => {
      const picked = (subs ?? []).filter((s) => s.keep && s.title.trim().length >= 2).map(({ title, description }) => ({ title, description }));
      const res = await createSubtasksAction(ticketId, picked);
      if (!res.ok) return setError(res.error);
      setDone(`${res.value} sous-tâche${res.value > 1 ? "s" : ""} ajoutée${res.value > 1 ? "s" : ""} au tableau.`);
      setSubs(null);
    });
  const kept = subs?.filter((s) => s.keep).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted">Découper la tâche</h3>
        <button type="button" className="btn-ghost h-8 text-xs" onClick={propose} disabled={pending}>
          <IconSparkle />
          {pending && !subs ? "…" : subs ? "Autre proposition" : "Proposer"}
        </button>
      </div>
      {subs && (
        <>
          <ul className="space-y-2">
            {subs.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Garder « ${s.title} »`}
                  checked={s.keep}
                  onChange={(e) => setSubs((xs) => xs!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                  className="mt-2"
                />
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`sub-${i}`}>Titre</label>
                  <input
                    id={`sub-${i}`}
                    value={s.title}
                    onChange={(e) => setSubs((xs) => xs!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="input h-8 w-full py-0 text-sm"
                  />
                  {s.description && <p className="mt-1 text-xs leading-5 text-muted">{s.description}</p>}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary w-full" onClick={create} disabled={pending || kept === 0}>
            {pending ? "Création…" : `Créer ${kept} sous-tâche${kept > 1 ? "s" : ""}`}
          </button>
        </>
      )}
      {!subs && !done && <p className="text-xs text-muted">Claude propose des étapes concrètes ; tu choisis lesquelles créer.</p>}
      {done && <p className="text-xs text-ok" role="status">{done}</p>}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
