import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  type Client,
  type ClientContact,
  type Project,
} from "@/lib/db/types";
import { EmptyState } from "@/components/item-row";
import { formatDay } from "@/lib/time/paris";
import { updateClient } from "../actions";
import { AddContactForm, AddProjectForm, DeleteContactButton, PortalAccessToggle, ProjectStatusSelect } from "../forms";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = z.uuid().safeParse((await params).id);
  if (!parsedId.success) notFound();
  const clientId = parsedId.data;

  const { supabase } = await requireOwner();
  const [{ data: client }, { data: contacts }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).maybeSingle<Client>(),
    supabase.from("client_contacts").select("*").eq("client_id", clientId).order("created_at"),
    supabase.from("projects").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
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

      <section className="card divide-y divide-border">
        <h2 className="section-title px-5 py-3">Contacts</h2>
        {(contacts as ClientContact[] | null)?.length ? (
          (contacts as ClientContact[]).map((c) => (
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
        {(projects as Project[] | null)?.length ? (
          (projects as Project[]).map((p) => (
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
