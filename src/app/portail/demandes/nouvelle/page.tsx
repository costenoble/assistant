import Link from "next/link";
import { getPortalProjects } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { NewRequestForm } from "../../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle demande · Espace client" };

export default async function NewRequestPage() {
  const { db, clients, clientIds } = await requireClient();
  const projects = await getPortalProjects(db, clientIds);
  return (
    <div className="space-y-6">
      <Link href="/portail" className="text-sm text-muted hover:text-text">← Retour à votre espace</Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Nouvelle demande</h1>
        <p className="text-sm text-muted">Une question, un problème, une modification à faire ? Nous vous répondons ici, et vous êtes prévenu par email.</p>
      </div>
      <section className="card p-5">
        <NewRequestForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name, client_id: p.client_id }))}
        />
      </section>
    </div>
  );
}
