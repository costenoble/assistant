"use client";

import { useTransition } from "react";
import type { ItemKind, ItemStatus } from "@/lib/db/types";
import { emailToTask, setPriority, setStatus, snooze } from "@/app/(app)/actions";

export function ItemActions({ id, kind, status }: { id: string; kind: ItemKind; status: ItemStatus }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => () => start(() => void fn());

  return (
    <div className={`flex shrink-0 items-start gap-0.5 transition ${pending ? "opacity-40" : "opacity-60 group-hover:opacity-100"}`}>
      {kind === "email" && (
        <button className="btn-ghost" onClick={run(() => emailToTask(id))} title="Transformer en tâche">
          → Tâche
        </button>
      )}
      {status !== "waiting" && kind !== "event" && (
        <button className="btn-ghost" onClick={run(() => setStatus(id, "waiting"))} title="En attente d'un tiers">
          Attente
        </button>
      )}
      <button className="btn-ghost" onClick={run(() => snooze(id, "tomorrow"))} title="Reporter à demain 9h">
        Demain
      </button>
      <button className="btn-ghost" onClick={run(() => setPriority(id, "critical"))} title="Marquer urgent">
        !!!
      </button>
      <button
        className="btn-ghost text-ok"
        onClick={run(() => setStatus(id, kind === "email" ? "archived" : "done"))}
        title={kind === "email" ? "Traité" : "Fait"}
      >
        ✓
      </button>
    </div>
  );
}
