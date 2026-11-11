import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { getInbox } from "@/lib/items/queries";
import { EmptyState, ItemRow } from "@/components/item-row";
import { getClientOptions } from "@/lib/clients/link";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tout?: string }> }) {
  const { db } = await requireOwner();
  const showBulk = (await searchParams).tout === "1";
  const now = new Date();
  const [items, clients] = await Promise.all([getInbox(db, { showBulk }, now), getClientOptions(db)]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mails</h1>
          <p className="text-sm text-muted">Triés par priorité, newsletters archivées automatiquement. Répondre depuis ton webmail les marque automatiquement comme traités.</p>
        </div>
        <Link href={showBulk ? "/inbox" : "/inbox?tout=1"} className="btn">
          {showBulk ? "Masquer les peu prioritaires" : "Afficher aussi les peu prioritaires"}
        </Link>
      </header>
      <section className="card overflow-hidden">
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((it) => <ItemRow key={it.id} item={it} now={now} clients={clients} />)}
          </ul>
        ) : (
          <EmptyState>Inbox zéro.</EmptyState>
        )}
      </section>
    </div>
  );
}
