import Link from "next/link";
import type { ClientOption, ItemWithEmail } from "@/lib/db/types";
import { ClientPicker } from "./client-picker";
import { formatDay, formatTime, relative } from "@/lib/time/paris";
import { ContextTag, PriorityDot } from "./priority-badge";
import { ItemActions } from "./item-actions";

/** Ligne d'item générique : tâche, mail, suivi. */
export function ItemRow({ item, now, clients = [] }: { item: ItemWithEmail; now: Date; clients?: ClientOption[] }) {
  const email = item.email_messages;
  const overdue = item.due_at && new Date(item.due_at) < now;
  const from = email ? (email.from_name ?? email.from_address) : (item.metadata.from as string | undefined);

  return (
    <li className="group flex gap-3 px-4 py-3 hover:bg-surface-2/60">
      <PriorityDot level={item.priority_level} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {item.url?.startsWith("/") ? (
            <Link href={item.url} className="truncate font-medium hover:underline">{item.title}</Link>
          ) : item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
              {item.title}
            </a>
          ) : (
            <span className="truncate font-medium">{item.title}</span>
          )}
          {from && <span className="truncate text-xs text-muted">· {from}</span>}
        </div>
        {(email?.snippet ?? item.body) && (
          <p className="line-clamp-1 text-sm text-muted">{email?.snippet ?? item.body}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <ContextTag context={item.context} />
          <ClientPicker itemId={item.id} clientId={item.client_id} clients={clients} />
          {item.due_at && (
            <span className={overdue ? "font-medium text-critical" : ""}>
              {overdue ? "En retard · " : "Échéance "}
              {formatDay(item.due_at)} {formatTime(item.due_at)}
            </span>
          )}
          {email && <span>reçu {relative(email.received_at, now)}</span>}
          {item.priority_reasons.slice(0, 2).map((r) => (
            <span key={r} className="rounded bg-surface-2 px-1.5 py-0.5">{r}</span>
          ))}
        </div>
      </div>
      {item.kind === "ticket" ? (
        <Link href={item.url ?? "/tickets"} className="btn-ghost shrink-0 self-start">Répondre</Link>
      ) : (
        <ItemActions id={item.id} kind={item.kind} status={item.status} />
      )}
    </li>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>;
}
