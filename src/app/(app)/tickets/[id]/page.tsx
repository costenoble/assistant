import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getTicketDetail } from "@/lib/tickets/queries";
import { TicketThread } from "@/components/ticket-thread";
import { TicketStatusBadge } from "@/components/ticket-list";
import { formatDay } from "@/lib/time/paris";
import { ReplyForm, TicketStatusSelect } from "../forms";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const detail = await getTicketDetail(db, parsed.data);
  if (!detail) notFound();
  const { ticket, client, contact, project, messages } = detail;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Link href="/tickets" className="text-sm text-muted hover:text-text">← Tickets</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold">
              <span className="text-muted">#{ticket.number}</span> {ticket.subject}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <TicketStatusBadge status={ticket.status} />
              {ticket.urgent && <span className="rounded bg-critical/15 px-1.5 py-0.5 text-xs font-semibold text-critical">Bloquant</span>}
              <Link href={`/clients/${client.id}`} className="font-medium text-text hover:underline">{client.name}</Link>
              {contact && <span>· {contact.name}{contact.email ? ` (${contact.email})` : ""}</span>}
              {project && <span>· projet « {project.name} »</span>}
              <span>· ouvert le {formatDay(ticket.created_at)}</span>
            </p>
          </div>
          <TicketStatusSelect ticketId={ticket.id} status={ticket.status} />
        </div>
      </div>

      <TicketThread messages={messages} viewer="admin" />

      <section className="card p-5">
        <ReplyForm ticketId={ticket.id} canNotify={!!contact?.email && !!contact.portal} />
      </section>
    </div>
  );
}
