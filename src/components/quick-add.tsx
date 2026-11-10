"use client";

import { useRef, useTransition } from "react";
import { quickAdd } from "@/app/(app)/actions";

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
      className="flex gap-2"
    >
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <input
        name="text"
        required
        autoComplete="off"
        placeholder={placeholder ?? "Noter une chose… ex. « Rappeler Jean demain 14h @client !! »"}
        className="input flex-1"
        aria-label="Ajout rapide"
      />
      <button className="btn-primary" disabled={pending}>
        {pending ? "…" : "Ajouter"}
      </button>
    </form>
  );
}
