"use client";

import { useTransition } from "react";
import { syncNow } from "@/app/(app)/actions";
import { IconSync } from "./icons";

/** Bloc de synchro du menu : état de la dernière synchro + bouton. `lastSync` déjà formaté côté serveur. */
export function SyncButton({ lastSync, failing }: { lastSync: string | null; failing?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2.5 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={`size-2 rounded-full ${pending ? "animate-pulse bg-accent" : failing ? "bg-high" : lastSync ? "bg-ok" : "bg-low"}`} />
        {pending ? "Synchro en cours…" : failing ? "Une source est en erreur" : lastSync ? `Synchronisé ${lastSync}` : "Jamais synchronisé"}
      </p>
      <button className="btn w-full" disabled={pending} onClick={() => start(() => syncNow())}>
        <IconSync className={pending ? "animate-spin" : ""} />
        Synchroniser
      </button>
    </div>
  );
}
