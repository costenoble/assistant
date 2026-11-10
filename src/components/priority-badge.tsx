import { CONTEXT_LABELS, LEVEL_LABELS, type ItemContext, type PriorityLevel } from "@/lib/db/types";

const LEVEL_STYLES: Record<PriorityLevel, string> = {
  critical: "bg-critical/12 text-critical",
  high: "bg-high/12 text-high",
  normal: "bg-normal/10 text-normal",
  low: "bg-low/15 text-muted",
};

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[level]}`}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

export function PriorityDot({ level }: { level: PriorityLevel }) {
  const color = { critical: "bg-critical", high: "bg-high", normal: "bg-normal", low: "bg-low" }[level];
  return <span aria-label={LEVEL_LABELS[level]} className={`mt-1.5 size-2 shrink-0 rounded-full ${color}`} />;
}

export function ContextTag({ context }: { context: ItemContext }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">{CONTEXT_LABELS[context]}</span>
  );
}
