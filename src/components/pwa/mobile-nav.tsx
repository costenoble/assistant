"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBoard, IconHome, IconMail, IconMic, IconMore } from "../icons";

const TABS = [
  { href: "/", label: "Aujourd'hui", icon: IconHome },
  { href: "/inbox", label: "Mails", icon: IconMail },
  { href: "/espaces", label: "Espaces", icon: IconBoard },
  { href: "/reunions", label: "Réunions", icon: IconMic },
] as const;

const MORE = [
  { href: "/taches", label: "Tâches" },
  { href: "/tickets", label: "Tickets" },
  { href: "/clients", label: "Clients" },
  { href: "/notifications", label: "Notifications" },
  { href: "/reglages", label: "Réglages" },
];

const isActive = (path: string, href: string) => path === href || (href !== "/" && path.startsWith(`${href}/`));

/** Barre d'onglets en bas de l'écran sur téléphone, à portée de pouce. */
export function MobileTabBar({ counts, footer }: { counts: { inbox: number; espaces: number; urgent: number }; footer: React.ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const badge = (n: number, alert = false) =>
    n > 0 ? <span className={`absolute -right-2 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 ${alert ? "bg-critical text-white" : "bg-accent text-accent-ink"}`}>{n > 99 ? "99+" : n}</span> : null;
  const moreActive = MORE.some((m) => isActive(path, m.href));

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Plus">
          <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/50" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            <nav aria-label="Autres pages" className="grid gap-1">
              {MORE.map((m) => (
                <Link key={m.href} href={m.href} aria-current={isActive(path, m.href) ? "page" : undefined} className={`rounded-lg px-4 py-3 text-[15px] ${isActive(path, m.href) ? "bg-surface-2 font-medium" : "text-text/90"}`}>
                  {m.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 border-t border-border pt-3">{footer}</div>
          </div>
        </div>
      )}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          const count = href === "/inbox" ? counts.inbox : href === "/espaces" ? counts.espaces : href === "/" ? counts.urgent : 0;
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}>
              <span className="relative">
                <Icon className="size-[22px]" />
                {badge(count, href === "/")}
              </span>
              {label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className={`flex flex-col items-center gap-1 py-2 text-[11px] ${more || moreActive ? "text-accent" : "text-muted"}`}>
          <IconMore className="size-[22px]" />
          Plus
        </button>
      </nav>
    </>
  );
}
