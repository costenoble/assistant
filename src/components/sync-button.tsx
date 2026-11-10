"use client";

import { useTransition } from "react";
import { syncNow } from "@/app/(app)/actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn w-full" disabled={pending} onClick={() => start(() => syncNow())}>
      {pending ? "Synchro en cours…" : "↻ Synchroniser"}
    </button>
  );
}
