import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getTicketDetail } from "@/lib/tickets/queries";
import { TicketThread } from "@/components/ticket-thread";
import { TicketStatusBadge } from "@/components/ticket-list";
import { formatDay } from "@/lib/time/paris";
import { ReplyForm, TicketStatusSelect } from "../forms";
import { TaskProperties, TaskTextEditor } from "./properties";
import { SplitTaskPanel } from "@/components/assistant/ticket-tools";
import { aiAvailable } from "@/lib/ai/claude";
import { and, asc, eq, ne } from "drizzle-orm";
import { clientContacts, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
// Brouillons et idées de Claude : jusqu'à une vingtaine de secondes.
export const maxDuration = 120;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const detail = await getTicketDetail(db, parsed.data);
  if (!detail) notFound();
  const { ticket, client, contact, project, messages, notifiable } = detail;
  const task = ticket.kind === "task";

  const workspaceHref = `/espaces/${client.id}${project ? `?projet=${project.id}` : ""}`;
  const contacts = task
    ? await db.select({ id: clientContacts.id, name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.client_id, client.id)).orderBy(asc(clientContacts.full_name))
    : [];
  const projectOptions = task
    ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.client_id, client.id), ne(projects.status, "archived")))
    : [];

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        {task ? (
          <Link href={workspaceHref} className="text-sm text-muted hover:text-text">← {client.name}{project ? ` · ${project.name}` : ""}</Link>
        ) : (
          <Link href="/tickets" className="text-sm text-muted hover:text-text">← Tickets</Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="page-title">
              <span className="text-muted">#{ticket.number}</span> {ticket.subject}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <TicketStatusBadge status={ticket.status} kind={ticket.kind} />
              {!task && ticket.urgent && <span className="rounded bg-critical/15 px-1.5 py-0.5 text-xs font-semibold text-critical">Bloquant</span>}
              {!task && <Link href={`/clients/${client.id}`} className="font-medium text-text hover:underline">{client.name}</Link>}
              {contact ? <span>· {task ? "créée par" : ""} {contact.name}{contact.email ? ` (${contact.email})` : ""}</span> : task && <span>· créée par toi</span>}
              {project && !task && <span>· projet « {project.name} »</span>}
              <span>· le {formatDay(ticket.created_at)}</span>
            </p>
          </div>
          {!task && <TicketStatusSelect ticketId={ticket.id} kind={ticket.kind} status={ticket.status} />}
        </div>
      </div>

      <div className={task ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]" : ""}>
        <div className="min-w-0 space-y-6">
          {task && (
            <section className="card p-5">
              <TaskTextEditor ticketId={ticket.id} subject={ticket.subject} description={ticket.description} />
            </section>
          )}
          <TicketThread messages={messages} viewer="admin" />
          <section className="card p-5">
            <ReplyForm ticketId={ticket.id} kind={ticket.kind} canNotify={notifiable} aiEnabled={aiAvailable()} />
          </section>
        </div>
        {task && (
          <aside className="card h-fit p-4 lg:sticky lg:top-6">
            <TaskProperties
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              assignee={ticket.assignee_contact_id ?? (ticket.assigned_to_owner ? "owner" : "")}
              projectId={ticket.project_id}
              dueOn={ticket.due_on}
              labels={ticket.labels}
              contacts={contacts}
              projects={projectOptions}
            />
            {aiAvailable() && ticket.status !== "resolved" && ticket.status !== "canceled" && (
              <div className="mt-5 border-t border-border pt-4">
                <SplitTaskPanel ticketId={ticket.id} />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
