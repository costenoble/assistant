"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portail", label: "Accueil", match: (p: string) => p === "/portail" || p.startsWith("/portail/espaces") || p.startsWith("/portail/projets") || p.startsWith("/portail/demandes") },
  { href: "/portail/profil", label: "Mon profil", match: (p: string) => p.startsWith("/portail/profil") },
];

/** Navigation de l'espace membre (pastille animée sous la page active). */
export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigation" className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-xl px-3 py-1.5 text-sm transition ${active ? "bg-surface-2/80 font-medium text-text" : "text-muted hover:text-text"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
