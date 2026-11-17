"use client";

import { useState, useTransition } from "react";
import { generateBriefAction } from "@/app/(app)/assistant/actions";
import type { Brief } from "@/lib/ai/assistant";
import { IconSparkle } from "../icons";

/** Point du matin par Claude : généré à la demande, gardé pour la journée. */
export function MorningBrief({ initial }: { initial: Brief | null }) {
  const [brief, setBrief] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      setError(null);
      const res = await generateBriefAction();
      if (res.ok) setBrief(res.value);
      else setError(res.error);
    });

  if (!brief) {
    return (
      <section aria-label="Point du matin" className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 text-sm text-muted">
          <IconSparkle className="text-accent" />
          {pending ? "Claude prépare ton point du matin…" : "Ton point du matin : ce qui presse, ce qui attend une réponse, tes rendez-vous."}
        </p>
        <button type="button" className="btn" onClick={run} disabled={pending}>{pending ? "…" : "Préparer mon point"}</button>
        {error && <p className="w-full text-sm text-danger" role="alert">{error}</p>}
      </section>
    );
  }
  const at = new Date(brief.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  return (
    <section aria-labelledby="brief-h" className="card space-y-3 border-accent/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="brief-h" className="flex items-start gap-2 font-medium leading-6">
          <IconSparkle className="mt-1 shrink-0 text-accent" />
          {brief.headline}
        </h2>
        <button type="button" className="btn-ghost h-8 text-xs text-muted" onClick={run} disabled={pending} title={`Préparé à ${at}`}>
          {pending ? "Mise à jour…" : `Mettre à jour (${at})`}
        </button>
      </div>
      <ul className="list-disc space-y-1 pl-10 text-sm leading-6 text-text/90">
        {brief.points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
