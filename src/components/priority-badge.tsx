import { CONTEXT_LABELS, LEVEL_LABELS, type ItemContext, type PriorityLevel } from "@/lib/db/types";

const LEVEL_STYLES: Record<PriorityLevel, string> = {
  critical: "bg-critical/15 text-critical",
  high: "bg-high/15 text-high",
  normal: "bg-normal/12 text-normal",
  low: "bg-surface-2 text-muted",
};

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[level]}`}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

const BAR: Record<PriorityLevel, string> = { critical: "bg-critical", high: "bg-high", normal: "bg-normal/70", low: "bg-low/60" };

/** Barre de priorité à gauche d'une ligne. Le niveau est aussi lu par les lecteurs d'écran. */
export function PriorityBar({ level }: { level: PriorityLevel }) {
  return (
    <span className={`w-[3px] shrink-0 self-stretch rounded-full ${BAR[level]}`}>
      <span className="sr-only">Priorité {LEVEL_LABELS[level].toLowerCase()}</span>
    </span>
  );
}

/** @deprecated garde la compatibilité ; préférer PriorityBar. */
export const PriorityDot = PriorityBar;

export function ContextTag({ context }: { context: ItemContext }) {
  return <span className="chip">{CONTEXT_LABELS[context]}</span>;
}
