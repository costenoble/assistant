import Link from "next/link";

/** Fil d'Ariane : on sait toujours où on est (Espace › Projet › Tâche), chaque niveau est cliquable. */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-border-strong">›</span>}
          {it.href && i < items.length - 1 ? (
            <Link href={it.href} className="truncate hover:text-text">{it.label}</Link>
          ) : (
            <span aria-current={i === items.length - 1 ? "page" : undefined} className="truncate text-text">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
