import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalTicket } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { statusLabel } from "@/lib/db/types";
import { TicketThread } from "@/components/ticket-thread";
import { formatDay } from "@/lib/time/paris";
import { RequestReplyForm, ValidateTaskForm } from "../../forms";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ envoye?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db, clientIds } = await requireClient();
  // Bornée aux clients du contact ; notes internes exclues.
  const ticket = await getPortalTicket(db, clientIds, parsed.data);
  if (!ticket) notFound();
  const justSent = (await searchParams).envoye === "1";
  const task = ticket.kind === "task";

  return (
    <div className="space-y-6">
      {task && ticket.project_id ? (
        <Link href={`/portail/projets/${ticket.project_id}`} className="text-sm text-muted hover:text-text">← {ticket.project_name}</Link>
      ) : (
        <Link href="/portail" className="text-sm text-muted hover:text-text">← Retour à votre espace</Link>
      )}
      {justSent && (
        <p className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-3 text-sm" role="status">
          Votre demande est bien envoyée. Vous recevrez un email dès que nous aurons répondu.
        </p>
      )}
      <div className="space-y-1">
        <h1 className="page-title"><span className="text-muted">#{ticket.number}</span> {ticket.subject}</h1>
        <p className="text-sm text-muted">
          {statusLabel(ticket.kind, ticket.status, "client")} · {task ? "créée" : "envoyée"} le {formatDay(ticket.created_at)}
        </p>
      </div>
      <TicketThread messages={ticket.messages} viewer="client" />
      {task && ticket.status === "waiting_client" && (
        <section className="card flex flex-wrap items-center justify-between gap-4 border-accent/40 p-5">
          <div className="space-y-1">
            <p className="font-medium">Cette tâche attend votre validation</p>
            <p className="text-sm text-muted">Tout est bon ? Validez-la. Sinon, laissez un commentaire ci-dessous : elle repartira en cours.</p>
          </div>
          <ValidateTaskForm ticketId={ticket.id} />
        </section>
      )}
      <section className="card p-5">
        <RequestReplyForm ticketId={ticket.id} resolved={ticket.status === "resolved"} task={task} />
      </section>
    </div>
  );
}
