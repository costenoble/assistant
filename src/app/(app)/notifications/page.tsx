import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { listNotifications } from "@/lib/notifications/service";
import { MarkRead } from "./mark-read";
import { relative } from "@/lib/time/paris";
import { EmptyState } from "@/components/item-row";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  client_new: "Nouveau",
  client_reply: "Commentaire",
  client_validated: "Validé",
  client_project: "Nouveau projet",
  urgent_mail: "Mail urgent",
  test: "Test",
};

export default async function NotificationsPage() {
  const { db } = await requireOwner();
  const rows = await listNotifications(db, 80);
  const now = new Date();
  return (
    <div className="max-w-3xl space-y-6">
      {rows.some((n) => !n.read_at) && <MarkRead />}
      <div className="space-y-1">
        <h1 className="page-title">Notifications</h1>
        <p className="text-sm text-muted">Ce que tes clients ont fait, et les mails urgents. Pour les recevoir aussi sur ton téléphone : Réglages → Notifications.</p>
      </div>
      <section className="card overflow-hidden">
        {rows.length ? (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id}>
                <Link href={n.url} className={`flex gap-3 px-4 py-3 transition hover:bg-surface-2/50 ${n.read_at ? "" : "bg-accent/5"}`}>
                  <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`} />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-xs text-muted">{relative(n.created_at, now)}</span>
                    </span>
                    {n.body && <span className="line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                    <span className="chip">{KIND_LABEL[n.kind] ?? n.kind}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Rien de neuf. Quand un client crée une tâche, commente ou valide, ça apparaît ici.</EmptyState>
        )}
      </section>
    </div>
  );
}
