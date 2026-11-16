"use client";

import { useRef, useTransition } from "react";
import { quickAdd } from "@/app/(app)/actions";
import { IconPlus } from "./icons";

/** `clientId` : la tâche créée est rattachée d'office à ce client (fiche client). */
export function QuickAdd({ clientId, placeholder }: { clientId?: string; placeholder?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          await quickAdd(fd);
          ref.current?.reset();
        })
      }
      className="flex items-center gap-2 rounded-xl border border-border bg-surface py-1.5 pl-3.5 pr-1.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25"
    >
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <IconPlus className="shrink-0 text-muted" />
      <input
        name="text"
        required
        autoComplete="off"
        placeholder={placeholder ?? "Noter une chose… « Rappeler Jean demain 14h @client !! »"}
        className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        aria-label="Ajout rapide"
      />
      <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted sm:block">Entrée</kbd>
      <button className="btn-primary" disabled={pending}>
        {pending ? "…" : "Ajouter"}
      </button>
    </form>
  );
}
