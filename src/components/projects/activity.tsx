import Link from "next/link";
import type { ActivityEvent } from "@/lib/projects/overview";
import { relative } from "@/lib/time/paris";
import { Avatar } from "../workspace/bits";

/** Fil d'activité : qui a fait quoi, avec un lien vers l'élément. */
export function ActivityList({ events, viewer, empty = "Rien de neuf pour l'instant." }: { events: ActivityEvent[]; viewer: "admin" | "client"; empty?: string }) {
  if (!events.length) return <p className="card px-4 py-6 text-center text-sm text-muted">{empty}</p>;
  const now = new Date();
  const href = (e: ActivityEvent) =>
    e.href.ticketId
      ? viewer === "admin" ? `/tickets/${e.href.ticketId}` : `/portail/demandes/${e.href.ticketId}`
      : e.href.projectId
        ? viewer === "admin" ? `/projets/${e.href.projectId}` : `/portail/projets/${e.href.projectId}`
        : e.href.meetingId
          ? viewer === "admin" ? `/reunions/${e.href.meetingId}` : null
          : null;
  const me = viewer === "admin" ? "Toi" : "Notre équipe";
  return (
    <ol className="card divide-y divide-border">
      {events.map((e, i) => {
        const who = e.who ?? me;
        const link = href(e);
        const body = (
          <>
            <Avatar name={who} size="size-7" owner={!e.who} />
            <span className="min-w-0 flex-1 text-sm leading-5">
              <strong className="font-medium">{who}</strong> <span className="text-muted">{e.text}</span>
            </span>
            <span className="shrink-0 text-xs text-muted">{relative(e.at, now)}</span>
          </>
        );
        return (
          <li key={i}>
            {link ? (
              <Link href={link} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2/50">{body}</Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
