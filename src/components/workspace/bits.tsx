import { TASK_PRIORITY_LABELS, type TaskPriority, type WorkspaceColor } from "@/lib/db/types";

/** Pastille de couleur d'un espace. Classes écrites en entier pour que Tailwind les garde. */
export const WORKSPACE_DOT: Record<WorkspaceColor, string> = {
  blue: "bg-[#5b8def]",
  violet: "bg-[#9b7bea]",
  green: "bg-[#3fb27f]",
  orange: "bg-[#e8954a]",
  pink: "bg-[#e06c9f]",
  teal: "bg-[#2fb3b3]",
  slate: "bg-[#8a94a3]",
};

export function WorkspaceDot({ color, className = "size-2.5" }: { color: WorkspaceColor; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-[4px] ${WORKSPACE_DOT[color]} ${className}`} />;
}

/** Icône de priorité façon Linear : barres croissantes, carré plein pour « urgente ». */
export function PriorityIcon({ priority, className = "" }: { priority: TaskPriority; className?: string }) {
  const label = TASK_PRIORITY_LABELS[priority];
  if (priority === "urgent") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={label} className={`shrink-0 text-critical ${className}`}>
        <title>{label}</title>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 4v3.6M7 9.6v.4" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  const filled = { none: 0, low: 1, medium: 2, high: 3 }[priority];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={label} className={`shrink-0 text-muted ${className}`}>
      <title>{label}</title>
      {priority === "none" ? (
        <path d="M2.5 7h2M6 7h2M9.5 7h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        [0, 1, 2].map((i) => (
          <rect key={i} x={2 + i * 3.6} y={9 - i * 3} width="2.4" height={3 + i * 3} rx="0.8" fill="currentColor" opacity={i < filled ? 1 : 0.28} />
        ))
      )}
    </svg>
  );
}

const AVATAR_TONES = ["bg-[#5b8def]", "bg-[#9b7bea]", "bg-[#3fb27f]", "bg-[#e8954a]", "bg-[#e06c9f]", "bg-[#2fb3b3]"];

/** Initiales sur fond coloré stable (même nom = même couleur). */
export function Avatar({ name, size = "size-6", owner, src }: { name: string; size?: string; owner?: boolean; src?: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- photo privée servie par Cockpit
    return <img src={src} alt={name} title={name} className={`inline-block shrink-0 rounded-full object-cover ring-2 ring-surface ${size}`} />;
  }
  if (owner) {
    // Toi (ou « Notre équipe » côté client) : une silhouette plutôt que des initiales.
    return (
      <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink ${size}`}>
        <svg viewBox="0 0 16 16" className="size-[62%]" fill="currentColor" aria-hidden>
          <circle cx="8" cy="5.5" r="3" />
          <path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5z" />
        </svg>
      </span>
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const tone = `${AVATAR_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length]} text-white`;
  return (
    <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${tone} ${size}`}>
      {initials || "?"}
    </span>
  );
}

/** Étiquette : couleur stable dérivée du texte. */
const LABEL_TONES = ["text-[#5b8def]", "text-[#9b7bea]", "text-[#3fb27f]", "text-[#e8954a]", "text-[#e06c9f]", "text-[#2fb3b3]"];
export function LabelChip({ label }: { label: string }) {
  const tone = LABEL_TONES[[...label].reduce((a, c) => a + c.charCodeAt(0), 0) % LABEL_TONES.length];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[11px] leading-4 text-muted">
      <span aria-hidden className={`text-[8px] ${tone}`}>●</span>
      {label}
    </span>
  );
}

/** Échéance courte : « 12 nov. », en rouge si dépassée. */
export function DueDate({ dueOn, done }: { dueOn: string; done?: boolean }) {
  const [y, m, d] = dueOn.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  const today = new Date();
  const late = !done && date.getTime() < Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0);
  return (
    <span className={`text-[11px] ${late ? "font-medium text-critical" : "text-muted"}`} title={late ? "Échéance dépassée" : "Échéance"}>
      {date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}
    </span>
  );
}
