"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftMailReplyAction, sendMailReplyAction } from "@/app/(app)/assistant/actions";
import { IconSend, IconSparkle } from "../icons";

/**
 * Répondre à un mail depuis Cockpit : brouillon par Claude (avec une consigne
 * facultative) ou écrit à la main, relu, puis envoyé depuis la bonne adresse.
 */
export function MailReplyPanel({ itemId, to, aiEnabled }: { itemId: string; to: string; aiEnabled: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[] | null>(null);
  const [drafting, startDraft] = useTransition();
  const [sending, startSend] = useTransition();

  const draft = () =>
    startDraft(async () => {
      setError(null);
      const res = await draftMailReplyAction(itemId, hint);
      if (res.ok) setBody(res.value);
      else setError(res.error);
    });

  const send = () => {
    if (!confirm(`Envoyer cette réponse à ${to} ?`)) return;
    startSend(async () => {
      setError(null);
      const res = await sendMailReplyAction(itemId, body);
      if (!res.ok) return setError(res.error);
      setSent(res.value.warnings);
      router.refresh();
    });
  };

  if (sent) {
    return (
      <section id="repondre" className="card space-y-2 p-5" role="status">
        <p className="font-medium text-ok">Réponse envoyée à {to}. Le mail est marqué comme traité.</p>
        {sent.map((w) => <p key={w} className="text-sm text-high">{w}</p>)}
      </section>
    );
  }

  return (
    <section id="repondre" aria-labelledby="repondre-h" className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="repondre-h" className="section-title">Répondre à {to}</h2>
      </div>
      {aiEnabled && (
        <div className="flex flex-wrap gap-2">
          <label htmlFor="reply-hint" className="sr-only">Consigne pour Claude</label>
          <input
            id="reply-hint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft())}
            placeholder="Consigne facultative : « accepter, proposer jeudi 14 h », « plus court »…"
            className="input min-w-0 flex-1"
          />
          <button type="button" className="btn" onClick={draft} disabled={drafting || sending}>
            <IconSparkle />
            {drafting ? "Claude rédige…" : body ? "Proposer une autre version" : "Proposer une réponse"}
          </button>
        </div>
      )}
      <label htmlFor="reply-body" className="sr-only">Ta réponse</label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={body ? Math.min(18, Math.max(8, body.split("\n").length + 2)) : 6}
        placeholder={aiEnabled ? "Écris ta réponse, ou demande un brouillon à Claude." : "Écris ta réponse."}
        className="input w-full resize-y leading-6"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Envoyée depuis ton adresse, avec le message d&apos;origine cité, et rangée dans « Envoyés ».</p>
        <button type="button" className="btn-primary" onClick={send} disabled={sending || drafting || body.trim().length < 2}>
          <IconSend />
          {sending ? "Envoi…" : "Envoyer"}
        </button>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
