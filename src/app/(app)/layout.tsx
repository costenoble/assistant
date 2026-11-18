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
import Link from "next/link";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeClass } from "@/lib/theme/theme";
import { ThemeSwitch } from "@/components/theme-switch";
import { countUnread } from "@/lib/notifications/service";
import { Bell } from "@/components/pwa/bell";
import { MobileTabBar } from "@/components/pwa/mobile-nav";
import { CommandPalette, SearchButton } from "@/components/search/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db } = await requireOwner();
  const [counts, openTickets, openTasks, unread, [sync]] = await Promise.all([
    getNavCounts(db),
    countOpenTickets(db),
    countOpenTasks(db),
    countUnread(db),
    db
      .select({
        at: max(sources.last_sync_at),
        failing: sql<boolean>`bool_or(${sources.active} and ${sources.last_error} is not null)`,
      })
      .from(sources),
  ]);

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const syncAndLogout = (
    <div className="space-y-2">
      <ThemeSwitch theme={theme} />
      <SyncButton lastSync={sync?.at ? relative(sync.at) : null} failing={!!sync?.failing} />
      <form action={signOut}>
        <button className="btn-ghost w-full justify-start px-3">
          <IconLogout />
          Se déconnecter
        </button>
      </form>
    </div>
  );

  return (
    <div className={`${themeClass(theme)} min-h-dvh bg-bg text-text`}>
      {/* Téléphone : bandeau du haut (sous l'encoche) ; la navigation est en bas. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/90 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 text-accent">
          <LogoMark />
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text">Cockpit</span>
        </Link>
        <span className="flex items-center gap-1">
          <SearchButton variant="icon" />
          <Bell unread={unread} />
        </span>
      </header>
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col md:flex-row">
        <aside className="hidden shrink-0 flex-col gap-6 border-border px-3 py-4 md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:border-r md:py-5">
          <div className="flex items-center justify-between gap-2.5 pl-3 pr-1 text-accent">
            <span className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text">Cockpit</span>
            </span>
            <Bell unread={unread} />
          </div>
          <SearchButton />
          <nav aria-label="Navigation principale" className="-mt-3 flex flex-col gap-0.5">
            <NavLink href="/" label="Aujourd'hui" count={counts.urgentTasks} alert />
            <NavLink href="/inbox" label="Mails" count={counts.inbox} />
            <NavLink href="/taches" label="Tâches" />
            <NavLink href="/espaces" label="Espaces" count={openTasks} />
            <NavLink href="/reunions" label="Réunions" />
            <NavLink href="/tickets" label="Tickets" count={openTickets} alert />
            <NavLink href="/clients" label="Clients" />
            <NavLink href="/reglages" label="Réglages" />
          </nav>
          <div className="mt-auto">{syncAndLogout}</div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4 md:px-8 md:pb-12 md:pt-7">{children}</main>
      </div>
      <CommandPalette />
      <MobileTabBar counts={{ inbox: counts.inbox, espaces: openTasks, urgent: counts.urgentTasks }} footer={syncAndLogout} />
    </div>
  );
}
