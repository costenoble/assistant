import Link from "next/link";
import type { ClientOption, ItemWithEmail } from "@/lib/db/types";
import { ClientPicker } from "./client-picker";
import { formatDay, formatTime, relative } from "@/lib/time/paris";
import { ContextTag, PriorityBar } from "./priority-badge";
import { IconReply } from "./icons";
import { ItemActions } from "./item-actions";

/** Ligne d'item générique : tâche, mail, suivi. */
export function ItemRow({ item, now, clients = [] }: { item: ItemWithEmail; now: Date; clients?: ClientOption[] }) {
  const email = item.email_messages;
  const overdue = item.due_at && new Date(item.due_at) < now;
  const from = email ? (email.from_name ?? email.from_address) : (item.metadata.from as string | undefined);

  return (
    <li className="group flex gap-3 py-2.5 pl-3 pr-2 transition hover:bg-surface-2/50">
      <PriorityBar level={item.priority_level} />
      <div className="min-w-0 flex-1 space-y-1 py-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {item.url?.startsWith("/") ? (
            <Link href={item.url} className="line-clamp-2 font-medium [overflow-wrap:anywhere] hover:underline">{item.title}</Link>
          ) : item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium [overflow-wrap:anywhere] hover:underline">
              {item.title}
            </a>
          ) : (
            <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{item.title}</span>
          )}
          {from && <span className="truncate text-xs text-muted">{from}</span>}
        </div>
        {(email?.snippet ?? item.body) && (
          <p className="line-clamp-1 text-[13px] text-muted">{email?.snippet ?? item.body}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {item.due_at && (
            <span className={overdue ? "font-medium text-critical" : "font-medium text-text/80"}>
              {overdue ? "En retard · " : "Échéance "}
              {formatDay(item.due_at)} {formatTime(item.due_at)}
            </span>
          )}
          {item.priority_reasons.slice(0, 2).map((r) => (
            <span key={r} className="chip">{r}</span>
          ))}
          <ContextTag context={item.context} />
          <ClientPicker itemId={item.id} clientId={item.client_id} clients={clients} />
          {email && <span>reçu {relative(email.received_at, now)}</span>}
        </div>
      </div>
      {item.kind === "ticket" ? (
        <Link href={item.url ?? "/tickets"} className="btn-ghost shrink-0 self-center">
          <IconReply />
          Répondre
        </Link>
      ) : (
        <ItemActions id={item.id} kind={item.kind} status={item.status} />
      )}
    </li>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}
