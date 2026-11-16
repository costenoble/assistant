"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** `alert` : le compteur passe en rouge (éléments urgents). */
export function NavLink({ href, label, count, alert }: { href: string; label: string; count?: number; alert?: boolean }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-sm transition ${
        active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
      }`}
    >
      {label}
      {!!count && <span className={alert ? "count-alert" : "count"}>{count}</span>}
    </Link>
  );
}
