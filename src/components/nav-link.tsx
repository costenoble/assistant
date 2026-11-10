"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, count }: { href: string; label: string; count?: number }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      {label}
      {!!count && <span className="rounded-full bg-accent/15 px-2 text-xs font-semibold text-accent">{count}</span>}
    </Link>
  );
}
