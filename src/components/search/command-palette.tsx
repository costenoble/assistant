"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAction } from "@/app/(app)/recherche/actions";
import type { SearchResult } from "@/lib/search/queries";
import { IconSearch } from "../icons";

const SHORTCUTS: SearchResult[] = [
  { group: "Tâches", title: "Aujourd'hui", href: "/" },
  { group: "Tâches", title: "Mails", href: "/inbox" },
  { group: "Tâches", title: "Lancer une réunion", href: "/reunions" },
  { group: "Tâches", title: "Espaces de travail", href: "/espaces" },
  { group: "Tâches", title: "Notifications", href: "/notifications" },
  { group: "Tâches", title: "Réglages", href: "/reglages" },
];

/** Bouton loupe qui ouvre la palette (barre latérale et bandeau mobile). */
export function SearchButton({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  const open = () => window.dispatchEvent(new Event("cockpit:search"));
  if (variant === "icon") {
    return (
      <button type="button" onClick={open} aria-label="Rechercher" className="icon-btn">
        <IconSearch className="size-[18px]" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted transition hover:border-border-strong hover:text-text"
    >
      <IconSearch />
      <span className="flex-1 text-left">Rechercher</span>
      <kbd className="rounded border border-border px-1.5 text-[11px]">⌘K</kbd>
    </button>
  );
}

/** Palette de recherche : Cmd/Ctrl + K ou « / », flèches et Entrée, Échap pour fermer. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cockpit:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cockpit:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  // Recherche à la frappe, après un court délai ; une réponse arrivée en retard est ignorée.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (query.length < 2 && !/^#\d+$/.test(query)) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(
      () =>
        start(async () => {
          const r = await searchAction(query);
          if (id === seq.current) {
            setResults(r);
            setActive(0);
          }
        }),
      150,
    );
    return () => clearTimeout(t);
  }, [q, open]);

  const searching = q.trim().length > 0;
  const list = searching ? results : SHORTCUTS;
  const grouped = useMemo(() => {
    const g = new Map<string, { r: SearchResult; i: number }[]>();
    list.forEach((r, i) => {
      const key = searching ? r.group : "Aller à";
      g.set(key, [...(g.get(key) ?? []), { r, i }]);
    });
    return [...g.entries()];
  }, [list, searching]);

  const go = (r: SearchResult | undefined) => {
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Recherche"
    >
      <button type="button" aria-label="Fermer la recherche" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <IconSearch className="shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, list.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(list[active]);
              }
            }}
            placeholder="Mail, tâche, client, réunion… ou #12"
            aria-label="Rechercher"
            aria-controls="search-results"
            aria-activedescendant={list[active] ? `search-${active}` : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          {pending && <span className="text-xs text-muted">…</span>}
          <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted sm:inline">Échap</kbd>
        </div>
        <ul id="search-results" role="listbox" aria-label="Résultats" className="max-h-[60vh] overflow-y-auto py-1">
          {grouped.map(([group, rows]) => (
            <li key={group} role="presentation">
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</p>
              <ul role="presentation">
                {rows.map(({ r, i }) => (
                  <li
                    key={`${r.href}-${i}`}
                    id={`search-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`mx-1 flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""}`}
                  >
                    <span className="min-w-0 truncate">{r.title}</span>
                    {r.subtitle && <span className="shrink-0 truncate text-xs text-muted max-sm:max-w-[40%]">{r.subtitle}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {searching && q.trim().length >= 2 && !pending && results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">Rien trouvé pour « {q.trim()} ».</li>
          )}
        </ul>
      </div>
    </div>
  );
}
