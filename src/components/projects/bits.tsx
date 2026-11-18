import { PROJECT_HEALTH_LABELS, type ProjectHealth } from "@/lib/db/types";

/** Barre d'avancement « 8 / 12 ». */
export function Progress({ done, total, className = "" }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${done} tâche(s) faite(s) sur ${total}`}>
        <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs tabular-nums text-muted">
        {total ? `${done} / ${total} tâche${total > 1 ? "s" : ""} faite${total > 1 ? "s" : ""}` : "Aucune tâche pour l'instant"}
      </p>
    </div>
  );
}

const HEALTH_TONE: Record<ProjectHealth, string> = {
  on_track: "bg-ok/12 text-ok",
  at_risk: "bg-high/15 text-high",
  off_track: "bg-critical/12 text-critical",
};

export function HealthBadge({ health }: { health: ProjectHealth }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${HEALTH_TONE[health]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {PROJECT_HEALTH_LABELS[health]}
    </span>
  );
}

/** Date courte « 15 déc. » (les dates de projet sont des jours, sans heure). */
export function shortDay(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}
