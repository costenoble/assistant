import Link from "next/link";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/db/types";
import { relative } from "@/lib/time/paris";

export interface TicketListRow {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  urgent: boolean;
  last_message_at: Date;
  last_client_message_at: Date | null;
  client_name: string;
  contact_name: string | null;
}

/** Durée écoulée, courte : « 12 min », « 5 h », « 3 j ». */
function since(d: Date, now: Date) {
  const ms = Math.max(0, now.getTime() - d.getTime());
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} j`;
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "bg-critical/15 text-critical",
  in_progress: "bg-accent/15 text-accent",
  waiting_client: "bg-surface-2 text-muted",
  resolved: "bg-ok/15 text-ok",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{TICKET_STATUS_LABELS[status]}</span>;
}

/** Liste admin. `showClient` : masqué sur la fiche d'un client. */
export function TicketList({ rows, now, showClient = true }: { rows: TicketListRow[]; now: Date; showClient?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((t) => {
        const waiting = (t.status === "open" || t.status === "in_progress") && t.last_client_message_at;
        return (
          <li key={t.id}>
            <Link href={`/tickets/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2/60">
              <span className="w-12 shrink-0 text-sm tabular-nums text-muted">#{t.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {t.urgent && <span className="mr-1.5 rounded bg-critical/15 px-1.5 py-0.5 text-xs font-semibold text-critical">Bloquant</span>}
                  {t.subject}
                </span>
                <span className="block truncate text-xs text-muted">
                  {[showClient ? t.client_name : null, t.contact_name].filter(Boolean).join(" · ") || "Ouvert par toi"}
                </span>
              </span>
              <span className="text-xs text-muted">
                {waiting ? `attend depuis ${since(t.last_client_message_at!, now)}` : relative(t.last_message_at, now)}
              </span>
              <TicketStatusBadge status={t.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
