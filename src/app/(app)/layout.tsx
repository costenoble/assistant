import { max, sql } from "drizzle-orm";
import { requireOwner } from "@/lib/auth/require-owner";
import { sources } from "@/lib/db/schema";
import { getNavCounts } from "@/lib/items/queries";
import { countOpenTasks, countOpenTickets } from "@/lib/tickets/queries";
import { relative } from "@/lib/time/paris";
import { NavLink } from "@/components/nav-link";
import { SyncButton } from "@/components/sync-button";
import { IconLogout, LogoMark } from "@/components/icons";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireOwner();
  const [counts, openTickets, openTasks, [sync]] = await Promise.all([
    getNavCounts(db),
    countOpenTickets(db),
    countOpenTasks(db),
    db
      .select({
        at: max(sources.last_sync_at),
        failing: sql<boolean>`bool_or(${sources.active} and ${sources.last_error} is not null)`,
      })
      .from(sources),
  ]);

  return (
    <div className="theme-dark min-h-dvh bg-bg text-text">
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col gap-6 border-border px-3 py-4 md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:py-5">
          <div className="flex items-center gap-2.5 px-3 text-accent">
            <LogoMark />
            <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text">Cockpit</span>
          </div>
          <nav aria-label="Navigation principale" className="flex gap-0.5 overflow-x-auto md:flex-col">
            <NavLink href="/" label="Aujourd'hui" count={counts.urgentTasks} alert />
            <NavLink href="/inbox" label="Mails" count={counts.inbox} />
            <NavLink href="/taches" label="Tâches" />
            <NavLink href="/projets" label="Projets" count={openTasks} />
            <NavLink href="/tickets" label="Tickets" count={openTickets} alert />
            <NavLink href="/clients" label="Clients" />
            <NavLink href="/reglages" label="Réglages" />
          </nav>
          <div className="mt-auto hidden space-y-1 md:block">
            <SyncButton lastSync={sync?.at ? relative(sync.at) : null} failing={!!sync?.failing} />
            <form action={signOut}>
              <button className="btn-ghost w-full justify-start px-3">
                <IconLogout />
                Se déconnecter
              </button>
            </form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-12 pt-2 md:px-8 md:pt-7">{children}</main>
      </div>
    </div>
  );
}
