import Link from "next/link";
import type { ProjectCardData } from "@/lib/projects/overview";
import { PROJECT_STATUS_LABELS } from "@/lib/db/types";
import { WorkspaceDot } from "../workspace/bits";
import { IconLock } from "../icons";
import { HealthBadge, Progress, shortDay } from "./bits";

/** Carte d'un projet : couleur, statut, santé, avancement, échéance, responsable, ce qui attend une validation. */
export function ProjectCard({ project: p, href, viewer }: { project: ProjectCardData; href: string; viewer: "admin" | "client" }) {
  const lead = p.lead === "owner" ? (viewer === "admin" ? "Toi" : "Notre équipe") : p.lead;
  return (
    <Link href={href} className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 font-display text-[17px] font-semibold leading-6">
          <WorkspaceDot color={p.color} className="size-3" />
          <span className="truncate">{p.name}</span>
          {p.status === "draft" && <IconLock className="shrink-0 text-high" />}
        </h3>
        {p.health ? <HealthBadge health={p.health} /> : <span className="chip shrink-0">{PROJECT_STATUS_LABELS[p.status]}</span>}
      </div>
      {p.description && <p className="line-clamp-2 text-sm leading-6 text-muted">{p.description}</p>}
      <Progress done={p.done} total={p.total} className="mt-auto" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {p.to_validate > 0 && <span className="font-semibold text-accent">{p.to_validate} à valider</span>}
        {p.open > 0 && <span>{p.open} en cours</span>}
        {p.due_on && <span>Livraison {shortDay(p.due_on)}</span>}
        {lead && <span className="ml-auto truncate">Resp. {lead}</span>}
      </div>
    </Link>
  );
}
