"use client";

import { useTransition } from "react";
import type { ItemKind, ItemStatus } from "@/lib/db/types";
import { emailToTask, setPriority, setStatus, snooze } from "@/app/(app)/actions";
import { IconCheck, IconClock, IconFlag, IconPause, IconTask } from "./icons";

/** Actions rapides d'une ligne : discrètes, révélées au survol (toujours visibles au clavier et sur mobile). */
export function ItemActions({ id, kind, status, alwaysVisible }: { id: string; kind: ItemKind; status: ItemStatus; alwaysVisible?: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => () => start(() => void fn());
  const done = kind === "email" ? "Marquer comme traité" : "Marquer comme fait";

  return (
    <div className={`flex shrink-0 items-center gap-0.5 transition ${alwaysVisible ? "" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"} ${pending ? "opacity-40!" : ""}`}>
      {kind === "email" && (
        <button className="icon-btn hidden sm:inline-flex" onClick={run(() => emailToTask(id))} aria-label="Transformer en tâche" title="Transformer en tâche">
          <IconTask />
        </button>
      )}
      {status !== "waiting" && kind !== "event" && (
        <button className="icon-btn hidden sm:inline-flex" onClick={run(() => setStatus(id, "waiting"))} aria-label="En attente d'un tiers" title="En attente d'un tiers">
          <IconPause />
        </button>
      )}
      <button className="icon-btn" onClick={run(() => snooze(id, "tomorrow"))} aria-label="Reporter à demain 9 h" title="Reporter à demain 9 h">
        <IconClock />
      </button>
      <button className="icon-btn hidden sm:inline-flex" onClick={run(() => setPriority(id, "critical"))} aria-label="Marquer urgent" title="Marquer urgent">
        <IconFlag />
      </button>
      <button
        className="icon-btn ml-1 border border-border text-ok hover:border-ok/50 hover:bg-ok/10 hover:text-ok"
        onClick={run(() => setStatus(id, kind === "email" ? "archived" : "done"))}
        aria-label={done}
        title={done}
      >
        <IconCheck />
      </button>
    </div>
  );
}
