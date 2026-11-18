import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { anthropicKey } from "@/lib/env";
import { getMeeting } from "@/lib/meetings/service";
import { formatDay, formatTime } from "@/lib/time/paris";
import { WorkspaceDot } from "@/components/workspace/bits";
import { Proposals } from "./proposals";
import { Recorder } from "./recorder";
import { DeleteMeetingButton, ReanalyzePanel } from "./tools";
import { MeetingShareToggle } from "../../projets/forms";

export const dynamic = "force-dynamic";
// L'analyse d'une longue réunion par Claude peut dépasser la minute.
export const maxDuration = 300;

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const meeting = await getMeeting(db, parsed.data);
  if (!meeting) notFound();
  const [[ws], members, wsProjects] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, color: clients.color }).from(clients).where(eq(clients.id, meeting.client_id)),
    db.select({ id: clientContacts.id, name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.client_id, meeting.client_id)).orderBy(asc(clientContacts.full_name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.client_id, meeting.client_id), ne(projects.status, "archived"))).orderBy(asc(projects.name)),
  ]);
  const ready = meeting.status === "ready";
  const project = wsProjects.find((p) => p.id === meeting.project_id);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <Link href="/reunions" className="text-sm text-muted hover:text-text">← Réunions</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="page-title">{meeting.title}</h1>
          <div className="flex items-center gap-3">
            {ready && <MeetingShareToggle meetingId={meeting.id} shared={meeting.shared} />}
            <DeleteMeetingButton meetingId={meeting.id} />
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {ws && (
            <Link href={`/espaces/${ws.id}`} className="flex items-center gap-1.5 font-medium text-text hover:underline">
              <WorkspaceDot color={ws.color} />
              {ws.name}
            </Link>
          )}
          {project && <span>· {project.name}</span>}
          <span>
            · le {formatDay(meeting.started_at)} à {formatTime(meeting.started_at)}
            {meeting.ended_at && `, jusqu'à ${formatTime(meeting.ended_at)}`}
          </span>
        </p>
      </header>

      {!anthropicKey() && (
        <p className="rounded-lg border border-high/40 bg-high/10 px-4 py-3 text-sm">
          La clé de l&apos;API Claude n&apos;est pas configurée (<code>ANTHROPIC_API_KEY</code>) : l&apos;enregistrement marche, mais pas l&apos;analyse.
        </p>
      )}

      {!ready ? (
        <Recorder
          meetingId={meeting.id}
          startedAt={meeting.started_at.toISOString()}
          initialTranscript={meeting.transcript}
          closed={!!meeting.ended_at}
          error={meeting.status === "failed" ? meeting.error : null}
        />
      ) : (
        <>
          <section aria-labelledby="resume-h" className="card space-y-4 p-5">
            <h2 id="resume-h" className="section-title">Résumé</h2>
            <p className="whitespace-pre-line text-[15px] leading-7">{meeting.summary}</p>
            {meeting.decisions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Décisions</h3>
                <ul className="list-disc space-y-1 pl-5 text-[15px] leading-7">
                  {meeting.decisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </section>
          <section aria-labelledby="taches-h" className="space-y-3">
            <h2 id="taches-h" className="section-title">Tâches proposées</h2>
            <Proposals meetingId={meeting.id} proposals={meeting.proposals} members={members} projects={wsProjects} />
          </section>
          <ReanalyzePanel meetingId={meeting.id} transcript={meeting.transcript} />
        </>
      )}
    </div>
  );
}
