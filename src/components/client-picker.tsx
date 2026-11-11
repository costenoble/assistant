"use client";

import { useTransition } from "react";
import type { ClientOption } from "@/lib/db/types";
import { setItemClient } from "@/app/(app)/actions";

/** Rattache un item à un client. Sans client, la liste reste discrète. */
export function ClientPicker({ itemId, clientId, clients }: { itemId: string; clientId: string | null; clients: ClientOption[] }) {
  const [pending, start] = useTransition();
  if (!clients.length) return null;
  return (
    <select
      aria-label="Client"
      disabled={pending}
      value={clientId ?? ""}
      onChange={(e) => {
        const next = e.target.value || null;
        start(() => setItemClient(itemId, next));
      }}
      className={`max-w-40 rounded border px-1.5 py-0.5 text-[11px] outline-none ${
        clientId ? "border-accent/40 bg-accent/10 font-medium text-accent" : "border-border bg-transparent text-muted"
      } ${pending ? "opacity-50" : ""}`}
    >
      <option value="">Client…</option>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
