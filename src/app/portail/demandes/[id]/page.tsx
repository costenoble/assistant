import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPortalTicket } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { TASK_PRIORITY_LABELS, statusLabel } from "@/lib/db/types";
import { DueDate, LabelChip, PriorityIcon } from "@/components/workspace/bits";
import { assigneeName } from "@/components/workspace/task-card";
import { Breadcrumb } from "@/components/projects/breadcrumb";
import { AttachmentList } from "@/components/files/attachment-list";
import { listTicketAttachments } from "@/lib/files/service";
import { getOwnerProfile } from "@/lib/profile/service";
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
  const files = await listTicketAttachments(db, ticket.id, { portal: true });
  const ticketFiles = files.filter((f) => !f.message_id);
  const threaded = ticket.messages.map((m) => ({ ...m, attachments: files.filter((f) => f.message_id === m.id) }));
  const task = ticket.kind === "task";

  return (
    <div className="space-y-6">
      {task ? (
        <Breadcrumb
          items={[
            { label: "Accueil", href: "/portail" },
            { label: ticket.client_name, href: `/portail/espaces/${ticket.client_id}` },
            ...(ticket.project_id && ticket.project_name ? [{ label: ticket.project_name, href: `/portail/projets/${ticket.project_id}` }] : []),
            { label: `#${ticket.number}` },
          ]}
        />
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
      {task && (
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-1.5"><PriorityIcon priority={ticket.priority} />{TASK_PRIORITY_LABELS[ticket.priority]}</span>
            {assigneeName(ticket, "client") && <span>Assignée à <strong className="font-medium text-text">{assigneeName(ticket, "client")}</strong></span>}
            {ticket.due_on && <span className="flex items-center gap-1.5">Échéance <DueDate dueOn={ticket.due_on} done={ticket.status === "resolved"} /></span>}
            {ticket.labels.map((l) => <LabelChip key={l} label={l} />)}
          </div>
          {ticket.description ? (
            <p className="whitespace-pre-line text-[15px] leading-7">{ticket.description}</p>
          ) : (
            <p className="text-sm text-muted">Pas de description.</p>
          )}
        </section>
      )}
      {ticketFiles.length > 0 && (
        <section aria-label="Pièces jointes" className="space-y-2">
          <h2 className="section-title">Pièces jointes</h2>
          <AttachmentList items={ticketFiles} />
        </section>
      )}
      <TicketThread messages={threaded} viewer="client" teamName={(await getOwnerProfile(db)).name ?? "Notre équipe"} />
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
