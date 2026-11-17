"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeMeetingAction, appendTranscriptAction, resumeMeetingAction } from "../actions";

/** Sous-ensemble de l'API Web Speech utilisé ici (préfixée « webkit » dans Chrome). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const stamp = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

type Phase = "idle" | "recording" | "review";

export function Recorder({
  meetingId,
  startedAt,
  initialTranscript,
  closed,
  error,
}: {
  meetingId: string;
  startedAt: string;
  initialTranscript: string;
  /** Enregistrement terminé : on relit et on lance l'analyse. */
  closed: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>(closed ? "review" : "idle");
  const [lines, setLines] = useState<string[]>(() => initialTranscript.split("\n").filter(Boolean));
  const [interim, setInterim] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(0);
  const [draft, setDraft] = useState(initialTranscript);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [analysisError, setAnalysisError] = useState<string | null>(error);
  const [analyzing, startAnalysis] = useTransition();

  const rec = useRef<Recognition | null>(null);
  const linesRef = useRef<string[]>(lines);
  const wanted = useRef(false);
  const queue = useRef<string[]>([]);
  const flushing = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const start0 = new Date(startedAt).getTime();

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  // Envoi au serveur, dans l'ordre, sans chevauchement. Ce qui échoue reste en file.
  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length) return;
    flushing.current = true;
    try {
      while (queue.current.length) {
        const batch = queue.current.slice(0, 50);
        const ok = await appendTranscriptAction(meetingId, batch.join("\n"));
        if (!ok) {
          setWarning("La réunion n'accepte plus de texte (déjà analysée ou trop longue).");
          queue.current = [];
          break;
        }
        queue.current = queue.current.slice(batch.length);
      }
      setWarning((w) => (w?.startsWith("Connexion") ? null : w));
    } catch {
      setWarning("Connexion au serveur perdue : le texte est gardé et sera renvoyé.");
    } finally {
      flushing.current = false;
      setUnsaved(queue.current.length);
    }
  }, [meetingId]);

  const push = useCallback((line: string) => {
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
    queue.current.push(line);
    setUnsaved(queue.current.length);
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      setNow(Date.now());
      void flush();
    }, 1000 * 3);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [phase, flush]);

  // Ne pas perdre la réunion en fermant l'onglet par erreur.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (wanted.current || queue.current.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [lines, interim]);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.abort();
  }, []);

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        const text = res[0].transcript.trim();
        if (!text) continue;
        if (res.isFinal) push(`[${stamp(Date.now() - start0)}] ${text}`);
        else pending += ` ${text}`;
      }
      setInterim(pending.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wanted.current = false;
        setWarning("Accès au micro refusé. Autorise le micro pour ce site dans Chrome (icône à gauche de l'adresse), puis relance.");
        setPhase("idle");
      } else if (e.error === "audio-capture") {
        wanted.current = false;
        setWarning("Aucun micro détecté.");
        setPhase("idle");
      } else if (e.error === "network") {
        setWarning("Connexion au service de reconnaissance perdue : reprise automatique…");
      }
      // « no-speech » et « aborted » : silence ou arrêt volontaire, on laisse onend relancer.
    };
    // Chrome coupe la reconnaissance après un silence ou au bout de quelques minutes : on relance.
    r.onend = () => {
      setInterim("");
      if (wanted.current) setTimeout(() => wanted.current && listen(), 300);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      // Déjà démarrée : rien à faire.
    }
  }

  function startRecording() {
    setWarning(null);
    wanted.current = true;
    setPhase("recording");
    listen();
  }

  async function stopRecording() {
    wanted.current = false;
    rec.current?.stop();
    if (interim) push(`[${stamp(Date.now() - start0)}] ${interim}`);
    setInterim("");
    await flush();
    setDraft(linesRef.current.join("\n"));
    setPhase("review");
  }

  function addNote() {
    const text = note.trim();
    if (!text) return;
    push(`[${stamp(Date.now() - start0)}] (note) ${text}`);
    setNote("");
    void flush();
  }

  function analyze() {
    setAnalysisError(null);
    startAnalysis(async () => {
      const res = await analyzeMeetingAction(meetingId, draft);
      if (res?.error) setAnalysisError(res.error);
      else router.refresh();
    });
  }

  if (phase === "review") {
    return (
      <section className="space-y-4">
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Transcription</h2>
            <span className="text-xs text-muted">Corrige les erreurs de reconnaissance si besoin, puis lance l&apos;analyse.</span>
          </div>
          <label htmlFor="transcript" className="sr-only">Transcription</label>
          <textarea
            id="transcript"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            placeholder="Aucun texte. Tu peux coller ici une transcription ou tes notes."
            className="input w-full resize-y font-mono text-[13px] leading-6"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="btn"
              disabled={analyzing}
              onClick={() =>
                startAnalysis(async () => {
                  // La transcription relue devient la base ; la réunion se rouvre côté serveur.
                  linesRef.current = draft.split("\n").filter(Boolean);
                  setLines(linesRef.current);
                  await resumeMeetingAction(meetingId, draft);
                  setPhase("idle");
                })
              }
            >
              Reprendre l&apos;enregistrement
            </button>
            <button type="button" className="btn-primary" onClick={analyze} disabled={analyzing || !draft.trim()}>
              {analyzing ? "Claude analyse la réunion…" : "Analyser avec Claude"}
            </button>
          </div>
          {analyzing && <p className="text-sm text-muted" role="status">Résumé, décisions et tâches proposées : compte jusqu&apos;à une minute pour une longue réunion.</p>}
          {analysisError && <p className="text-sm text-danger" role="alert">{analysisError}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {phase === "recording" ? (
            <p className="flex items-center gap-2.5 text-sm font-medium" role="status">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-critical opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-critical" />
              </span>
              Enregistrement · <span className="tabular-nums">{stamp(now - start0)}</span>
              {unsaved > 0 && <span className="text-xs font-normal text-muted">· {unsaved} ligne(s) en cours d&apos;envoi</span>}
            </p>
          ) : (
            <p className="text-sm text-muted">{lines.length ? `${lines.length} ligne(s) déjà transcrite(s).` : "Prêt à écouter."}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {phase === "recording" ? (
              <button type="button" className="btn-primary" onClick={stopRecording}>Terminer la réunion</button>
            ) : (
              <>
                {lines.length > 0 && <button type="button" className="btn" onClick={() => { setDraft(lines.join("\n")); setPhase("review"); }}>Terminer sans enregistrer plus</button>}
                <button type="button" className="btn-primary" onClick={startRecording} disabled={supported === false}>
                  {lines.length ? "Reprendre l'écoute" : "Démarrer l'écoute"}
                </button>
              </>
            )}
          </div>
        </div>

        {supported === false && (
          <p className="rounded-lg border border-high/40 bg-high/10 px-3 py-2 text-sm">
            Ce navigateur ne propose pas la reconnaissance vocale : ouvre Cockpit dans Chrome ou Edge.{" "}
            <button type="button" className="underline" onClick={() => setPhase("review")}>Ou colle une transcription</button>.
          </p>
        )}
        {warning && <p className="text-sm text-high" role="alert">{warning}</p>}

        <div ref={boxRef} className="h-80 overflow-y-auto rounded-lg border border-border bg-surface-2/40 p-3 font-mono text-[13px] leading-6" aria-live="polite">
          {lines.length === 0 && !interim && <p className="text-muted">La transcription apparaîtra ici.</p>}
          {lines.map((l, i) => (
            <p key={i} className="[overflow-wrap:anywhere]">
              <span className="text-muted">{l.match(/^\[[^\]]+\]/)?.[0]}</span>
              {l.replace(/^\[[^\]]+\]/, "")}
            </p>
          ))}
          {interim && <p className="text-muted italic">{interim}</p>}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addNote();
          }}
        >
          <label htmlFor="note" className="sr-only">Ajouter une note</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note (ex. « Marc valide la maquette »)" className="input flex-1" />
          <button className="btn" disabled={!note.trim()}>Ajouter</button>
        </form>
      </div>
      <p className="text-xs leading-5 text-muted">
        La reconnaissance vocale de Chrome envoie le son aux serveurs de Google pour le transcrire ; le texte, lui, est enregistré dans Cockpit puis envoyé à Claude à l&apos;analyse. Préviens les participants. Garde cet onglet ouvert pendant la réunion.
      </p>
    </section>
  );
}
