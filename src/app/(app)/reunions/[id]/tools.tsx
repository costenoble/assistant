"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeMeetingAction, deleteMeetingAction } from "../actions";

export function DeleteMeetingButton({ meetingId }: { meetingId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-sm text-muted"
      disabled={pending}
      onClick={() => {
        if (confirm("Supprimer cette réunion et sa transcription ? Les tâches déjà créées restent.")) start(() => deleteMeetingAction(meetingId));
      }}
    >
      Supprimer
    </button>
  );
}

/** Transcription relue et réanalyse (les tâches déjà créées restent). */
export function ReanalyzePanel({ meetingId, transcript }: { meetingId: string; transcript: string }) {
  const router = useRouter();
  const [text, setText] = useState(transcript);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium">Transcription complète</summary>
      <div className="mt-3 space-y-3">
        <label htmlFor="full-transcript" className="sr-only">Transcription</label>
        <textarea id="full-transcript" value={text} onChange={(e) => setText(e.target.value)} rows={14} className="input w-full resize-y font-mono text-[13px] leading-6" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Corrigée ? Relance l&apos;analyse : les tâches déjà créées sont gardées.</p>
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await analyzeMeetingAction(meetingId, text);
                if (res?.error) setError(res.error);
                else router.refresh();
              })
            }
          >
            {pending ? "Analyse…" : "Réanalyser"}
          </button>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </details>
  );
}
