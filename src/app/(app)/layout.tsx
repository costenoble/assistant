import { requireOwner } from "@/lib/auth/require-owner";
import { getNavCounts } from "@/lib/items/queries";
import { NavLink } from "@/components/nav-link";
import { SyncButton } from "@/components/sync-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireOwner();
  const counts = await getNavCounts(supabase);

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-border p-4 md:sticky md:top-0 md:h-dvh md:w-56 md:border-r">
        <p className="px-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">Cockpit</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          <NavLink href="/" label="Aujourd'hui" count={counts.urgentTasks} />
          <NavLink href="/inbox" label="Mails" count={counts.inbox} />
          <NavLink href="/taches" label="Tâches" />
          <NavLink href="/reglages" label="Réglages" />
        </nav>
        <div className="mt-auto hidden md:block">
          <SyncButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
