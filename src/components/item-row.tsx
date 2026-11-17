import Link from "next/link";
import type { ClientOption, EmailSummary, ItemWithEmail } from "@/lib/db/types";
import { Avatar } from "./workspace/bits";
import { ClientPicker } from "./client-picker";
import { formatDay, formatTime, relative } from "@/lib/time/paris";
import { ContextTag, PriorityBar } from "./priority-badge";
import { IconReply } from "./icons";
import { ItemActions } from "./item-actions";

/** Ligne d'item générique : tâche, mail, suivi. */
export function ItemRow({ item, now, clients = [] }: { item: ItemWithEmail; now: Date; clients?: ClientOption[] }) {
  if (item.kind === "email" && item.email_messages) return <MailRow item={item} email={item.email_messages} now={now} clients={clients} />;
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
          {/* Le client, plus précis, remplace le contexte (évite « Semaphors · Semaphors »). */}
          {!item.client_id && <ContextTag context={item.context} />}
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

/** Heure si c'est aujourd'hui, sinon date courte. */
function when(d: Date | string, now: Date) {
  const date = new Date(d);
  return formatDay(date) === formatDay(now) ? formatTime(date) : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

/** Ligne de mail, façon boîte de réception : toute la ligne ouvre le mail. */
function MailRow({ item, email, now, clients }: { item: ItemWithEmail; email: EmailSummary; now: Date; clients: ClientOption[] }) {
  const sender = email.from_name ?? email.from_address ?? "Expéditeur inconnu";
  const unread = !email.is_seen;
  return (
    <li className="group relative flex gap-3 py-3 pl-3 pr-2 transition hover:bg-surface-2/50">
      <PriorityBar level={item.priority_level} />
      <Avatar name={sender} size="size-8" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline gap-2">
          {unread && <span aria-label="Non lu" className="size-1.5 shrink-0 self-center rounded-full bg-accent" />}
          <span className={`min-w-0 truncate text-sm ${unread ? "font-semibold" : "font-medium text-text/85"}`}>{sender}</span>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{when(email.received_at, now)}</span>
        </div>
        <Link href={`/inbox/${item.id}`} className="block truncate text-[14px] font-medium after:absolute after:inset-0 after:content-['']">
          {item.title}
        </Link>
        {email.snippet && <p className="line-clamp-1 text-[13px] text-muted">{email.snippet}</p>}
        {(item.client_id || clients.length > 0 || item.priority_reasons.length > 0) && (
          <div className="relative z-10 flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
            {item.priority_reasons.slice(0, 2).map((r) => (
              <span key={r} className="chip">{r}</span>
            ))}
            {!item.client_id && <ContextTag context={item.context} />}
            <ClientPicker itemId={item.id} clientId={item.client_id} clients={clients} />
          </div>
        )}
      </div>
      <div className="relative z-10 self-center">
        <ItemActions id={item.id} kind={item.kind} status={item.status} />
      </div>
    </li>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}
