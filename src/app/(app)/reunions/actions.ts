"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { clients, meetings, projects } from "@/lib/db/schema";
import { TASK_PRIORITIES } from "@/lib/db/types";
import { AnalysisError, analyzeTranscript } from "@/lib/meetings/analyze";
import {
  acceptProposals,
  analysisContext,
  appendTranscript,
  closeMeeting,
  createMeeting,
  getMeeting,
  saveAnalysis,
  saveAnalysisError,
} from "@/lib/meetings/service";

export type MeetingFormState = { error?: string; message?: string } | null;
const id = z.uuid();

export async function startMeeting(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      workspace_id: z.uuid("Choisis un espace."),
      project_id: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
      title: z.string().trim().max(120).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const [ws] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, parsed.data.workspace_id));
  if (!ws) return { error: "Espace introuvable." };
  if (parsed.data.project_id) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, parsed.data.project_id), eq(projects.client_id, ws.id)));
    if (!p) return { error: "Projet introuvable dans cet espace." };
  }
  const m = await createMeeting(db, { clientId: ws.id, projectId: parsed.data.project_id, title: parsed.data.title });
  revalidatePath("/reunions");
  redirect(`/reunions/${m.id}`);
}

/** Appelée toutes les quelques secondes pendant l'enregistrement. false = la réunion n'accepte plus de texte. */
export async function appendTranscriptAction(meetingId: string, chunk: string): Promise<boolean> {
  const { db } = await requireOwner();
  return appendTranscript(db, id.parse(meetingId), z.string().max(50_000).parse(chunk));
}

/** Clôt la réunion (avec la transcription relue) et la fait analyser par Claude. */
export async function analyzeMeetingAction(meetingId: string, transcript: string): Promise<MeetingFormState> {
  const { db } = await requireOwner();
  const m = await closeMeeting(db, id.parse(meetingId), z.string().max(400_000).parse(transcript));
  if (!m) return { error: "Réunion introuvable." };
  if (m.transcript.trim().split(/\s+/).length < 5) return { error: "La transcription est presque vide : rien à analyser." };
  try {
    const result = await analyzeTranscript(m.transcript, await analysisContext(db, m));
    await saveAnalysis(db, m.id, result);
  } catch (err) {
    const message = err instanceof AnalysisError ? err.message : "L'analyse a échoué. Réessaie.";
    if (!(err instanceof AnalysisError)) console.error("[réunion] analyse", err);
    await saveAnalysisError(db, m.id, message);
    revalidatePath(`/reunions/${m.id}`);
    return { error: message };
  }
  revalidatePath(`/reunions/${m.id}`);
  revalidatePath("/reunions");
  return null;
}

const pickSchema = z.array(
  z.object({
    index: z.number().int().min(0).max(100),
    edit: z
      .object({
        title: z.string().trim().min(2).max(200).optional(),
        assignee: z.string().nullable().optional(),
        project_id: z.string().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
      })
      .optional(),
  }),
);

export async function acceptProposalsAction(meetingId: string, picks: unknown): Promise<MeetingFormState> {
  const { db } = await requireOwner();
  const m = await getMeeting(db, id.parse(meetingId));
  if (!m) return { error: "Réunion introuvable." };
  const parsed = pickSchema.safeParse(picks);
  if (!parsed.success) return { error: "Sélection invalide." };
  const created = await acceptProposals(db, m.id, parsed.data);
  revalidatePath(`/reunions/${m.id}`);
  revalidatePath(`/espaces/${m.client_id}`);
  revalidatePath("/");
  return { message: created.length ? `${created.length} tâche${created.length > 1 ? "s" : ""} ajoutée${created.length > 1 ? "s" : ""} à l'espace.` : "Rien de nouveau à créer." };
}

/** Reprendre l'enregistrement d'une réunion close mais pas encore analysée. */
export async function resumeMeetingAction(meetingId: string, transcript: string) {
  const { db } = await requireOwner();
  await db
    .update(meetings)
    .set({ ended_at: null, status: "draft", transcript: z.string().max(400_000).parse(transcript) })
    .where(eq(meetings.id, id.parse(meetingId)));
  revalidatePath(`/reunions/${meetingId}`);
}

export async function deleteMeetingAction(meetingId: string) {
  const { db } = await requireOwner();
  await db.delete(meetings).where(eq(meetings.id, id.parse(meetingId)));
  revalidatePath("/reunions");
  redirect("/reunions");
}
