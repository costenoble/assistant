import Link from "next/link";
import { cookies } from "next/headers";
import { requireClient } from "@/lib/auth/require-client";
import { signOut } from "@/app/login/actions";
import { LogoMark } from "@/components/icons";
import { Avatar } from "@/components/workspace/bits";
import { avatarUrl } from "@/lib/profile/avatar-url";
import { THEME_COOKIE, parseTheme, themeClass } from "@/lib/theme/theme";
import { PortalNav } from "./nav";

export const metadata = { title: "Espace membre" };

/** Espace membre : style « pro » (verre dépoli, coins arrondis), clair par défaut, thème au choix. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { contact, clients } = await requireClient();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value ?? "light");
  const photo = avatarUrl(contact.id, contact.avatar_key);
  return (
    <div className={`skin-member ${themeClass(theme)} min-h-dvh text-text`}>
      <header className="glass sticky top-0 z-40 border-b border-border/60 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/portail" className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent"><LogoMark /></span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-display text-[15px] font-semibold">Espace membre</span>
                <span className="truncate text-xs text-muted">{clients.map((c) => c.name).join(" · ")}</span>
              </span>
            </Link>
            <PortalNav />
          </div>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border/70 bg-surface/70 py-1 pl-1 pr-3 transition hover:border-border-strong [&::-webkit-details-marker]:hidden">
              <Avatar name={contact.full_name} src={photo} size="size-8 text-xs" />
              <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">{contact.full_name}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-muted transition group-open:rotate-180"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </summary>
            <div className="glass pop-in absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border/70 p-1.5 shadow-[var(--shadow-lift)]">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={contact.full_name} src={photo} size="size-10 text-sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{contact.full_name}</p>
                  <p className="truncate text-xs text-muted">{contact.email}</p>
                </div>
              </div>
              <div className="my-1 border-t border-border/70" />
              <Link href="/portail/profil" className="block rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2">Mon profil</Link>
              <form action={signOut}>
                <button className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted transition hover:bg-surface-2 hover:text-text">Se déconnecter</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}
