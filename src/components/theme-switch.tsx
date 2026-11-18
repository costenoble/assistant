"use client";

import { useOptimistic, useTransition } from "react";
import { setThemeAction } from "@/app/theme-actions";
import { THEMES, THEME_LABELS, type Theme } from "@/lib/theme/theme";

const ICONS: Record<Theme, React.ReactNode> = {
  dark: <path d="M12.5 9.5A5 5 0 0 1 6.5 3.5a5 5 0 1 0 6 6z" />,
  light: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
    </>
  ),
  system: (
    <>
      <rect x="2" y="3" width="12" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11.5V14" />
    </>
  ),
};

const Icon = ({ theme }: { theme: Theme }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {ICONS[theme]}
  </svg>
);

/** Choix du thème : trois boutons (Sombre, Clair, Auto). */
export function ThemeSwitch({ theme }: { theme: Theme }) {
  const [current, setOptimistic] = useOptimistic(theme);
  const [, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-1">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={current === t}
          onClick={() =>
            start(async () => {
              setOptimistic(t);
              await setThemeAction(t);
            })
          }
          className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs transition ${current === t ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"}`}
        >
          <Icon theme={t} />
          {THEME_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
