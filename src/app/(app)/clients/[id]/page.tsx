import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { asc, desc, eq } from "drizzle-orm";
import { clientContacts, clients, projects as projectsTable } from "@/lib/db/schema";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/db/types";
import { EmptyState, ItemRow } from "@/components/item-row";
import { QuickAdd } from "@/components/quick-add";
import { getClientActivity, getClientOptions } from "@/lib/clients/link";
import { getClientTickets } from "@/lib/tickets/queries";
import { TicketList } from "@/components/ticket-list";
import { formatDay, relative } from "@/lib/time/paris";
import { addNote, updateClient } from "../actions";
import { AddContactForm, AddProjectForm, DeleteContactButton, DeleteNoteButton, PortalAccessToggle, ProjectStatusSelect } from "../forms";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const clientId = parsedId.data;

  const { db } = await requireOwner();
  const now = new Date();
  const [[client], contacts, projects, activity, clientOptions, clientTickets] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, clientId)),
    db.select().from(clientContacts).where(eq(clientContacts.client_id, clientId)).orderBy(asc(clientContacts.created_at)),
    db.select().from(projectsTable).where(eq(projectsTable.client_id, clientId)).orderBy(desc(projectsTable.created_at)),
    getClientActivity(db, clientId),
    getClientOptions(db),
    getClientTickets(db, clientId),
  ]);
  if (!client) notFound();

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link href="/clients" className="text-sm text-muted hover:underline">← Clients</Link>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
      </header>

      <section className="card space-y-3 p-5">
        <h2 className="section-title">Fiche</h2>
        <form action={updateClient.bind(null, client.id)} className="grid gap-2 sm:grid-cols-[auto_2fr_2fr_auto]">
          <select name="status" defaultValue={client.status} className="input" aria-label="Statut">
            {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_STATUS_LABELS[s]}</option>)}
          </select>
          <input name="website" defaultValue={client.website ?? ""} placeholder="Site" className="input" />
          <input
            name="email_domains"
            defaultValue={client.email_domains.join(", ")}
            placeholder="Domaines mail : client.fr"
            className="input"
          />
          <button className="btn">Enregistrer</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="space-y-3 border-b border-border px-5 py-3">
          <h2 className="section-title">À traiter pour ce client</h2>
          <QuickAdd clientId={client.id} placeholder={`Nouvelle tâche pour ${client.name}… ex. « Envoyer le devis vendredi !! »`} />
        </div>
        {activity.open.length ? (
          <ul className="divide-y divide-border">
            {activity.open.map((it) => <ItemRow key={it.id} item={it} now={now} clients={clientOptions} />)}
          </ul>
        ) : (
          <EmptyState>
            Rien en cours. Les mails venant de {client.email_domains.length ? client.email_domains.join(", ") : "ses contacts"} arrivent ici automatiquement.
          </EmptyState>
        )}
        {activity.closed.length > 0 && (
          <details className="border-t border-border">
            <summary className="cursor-pointer px-5 py-3 text-sm text-muted">Terminé récemment ({activity.closed.length})</summary>
            <ul className="divide-y divide-border border-t border-border">
              {activity.closed.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
                  <span className="truncate text-muted line-through">{it.title}</span>
                  <span className="shrink-0 text-xs text-muted">{relative(it.updated_at, now)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {clientTickets.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="section-title border-b border-border px-5 py-3">Demandes du client</h2>
          <TicketList rows={clientTickets} now={now} showClient={false} />
        </section>
      )}

      <section className="card divide-y divide-border">
        <h2 className="section-title px-5 py-3">Notes internes <span className="font-normal normal-case tracking-normal">· jamais visibles du client</span></h2>
        {activity.notes.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0 space-y-1">
              <p className="whitespace-pre-line text-sm">{n.body}</p>
              <p className="text-xs text-muted">{formatDay(n.created_at)}</p>
            </div>
            <DeleteNoteButton noteId={n.id} clientId={client.id} />
          </div>
        ))}
        <form action={addNote.bind(null, client.id)} className="flex gap-2 px-5 py-4">
          <input name="body" required autoComplete="off" placeholder="Ajouter une note… ex. « Préfère être appelée le matin »" className="input flex-1" aria-label="Nouvelle note" />
          <button className="btn">Noter</button>
        </form>
      </section>

      <section className="card divide-y divide-border">
        <h2 className="section-title px-5 py-3">Contacts</h2>
        {contacts.length ? (
          contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="space-y-0.5">
                <p className="font-medium">
                  {c.full_name}
                  {c.job_title && <span className="text-sm font-normal text-muted"> · {c.job_title}</span>}
                </p>
                <p className="text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(" · ") || "aucune coordonnée"}</p>
                {c.portal_access && <p className="text-xs font-medium text-ok">Accès portail actif</p>}
              </div>
              <div className="flex items-start gap-1">
                <PortalAccessToggle contactId={c.id} enabled={c.portal_access} hasEmail={!!c.email} />
                <DeleteContactButton contactId={c.id} clientId={client.id} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState>Aucun contact.</EmptyState>
        )}
        <div className="px-5 py-4">
          <AddContactForm clientId={client.id} />
        </div>
      </section>

      <section className="card divide-y divide-border">
        <h2 className="section-title px-5 py-3">Projets</h2>
        {projects.length ? (
          projects.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{p.name}</p>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
                {p.due_on && <p className="text-xs text-muted">Échéance {formatDay(p.due_on)}</p>}
              </div>
              <ProjectStatusSelect projectId={p.id} clientId={client.id} status={p.status} />
            </div>
          ))
        ) : (
          <EmptyState>Aucun projet.</EmptyState>
        )}
        <div className="px-5 py-4">
          <AddProjectForm clientId={client.id} />
        </div>
      </section>
    </div>
  );
}
