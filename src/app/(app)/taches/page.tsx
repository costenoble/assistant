import Link from "next/link";
import { requireOwner } from "@/lib/auth/require-owner";
import { getTasks } from "@/lib/items/queries";
import { EmptyState, ItemRow } from "@/components/item-row";
import { getClientOptions } from "@/lib/clients/link";
import { QuickAdd } from "@/components/quick-add";
import { CONTEXT_LABELS, ITEM_CONTEXTS, type ItemContext } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "open", label: "À faire" },
  { key: "waiting", label: "En attente" },
  { key: "done", label: "Terminées" },
] as const;

type Search = { ctx?: string; statut?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { db } = await requireOwner();
  const sp = await searchParams;
  const context = ITEM_CONTEXTS.find((c) => c === sp.ctx);
  const status = STATUS_TABS.find((t) => t.key === sp.statut)?.key ?? "open";
  const now = new Date();
  const [items, clients] = await Promise.all([getTasks(db, { context, status }), getClientOptions(db)]);

  const href = (next: Partial<{ ctx: ItemContext | undefined; statut: string }>) => {
    const p = new URLSearchParams();
    const c = "ctx" in next ? next.ctx : context;
    const s = next.statut ?? status;
    if (c) p.set("ctx", c);
    if (s !== "open") p.set("statut", s);
    const q = p.toString();
    return q ? `/taches?${q}` : "/taches";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tâches</h1>
      <QuickAdd />
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <Link key={t.key} href={href({ statut: t.key })} className={t.key === status ? "btn-primary py-1.5" : "btn"}>
            {t.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Link href={href({ ctx: undefined })} className={!context ? "btn bg-surface-2" : "btn"}>Tous</Link>
        {ITEM_CONTEXTS.map((c) => (
          <Link key={c} href={href({ ctx: c })} className={c === context ? "btn bg-surface-2" : "btn"}>
            {CONTEXT_LABELS[c]}
          </Link>
        ))}
      </div>
      <section className="card overflow-hidden">
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((it) => <ItemRow key={it.id} item={it} now={now} clients={clients} />)}
          </ul>
        ) : (
          <EmptyState>Aucune tâche ici.</EmptyState>
        )}
      </section>
    </div>
  );
}
