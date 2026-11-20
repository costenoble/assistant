"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { projects } from "@/lib/db/schema";
import { aiErrorMessage, setWritingStyle } from "@/lib/ai/claude";
import { draftMailReply, draftTicketReply, generateTodayBrief, projectIdeas, splitTask, type Brief, type Idea } from "@/lib/ai/assistant";
import { getMail } from "@/lib/mail/queries";
import { loadMessageBody } from "@/lib/mail/message-store";
import { MailSendError, sendMailReply } from "@/lib/mail/reply";
import { createTicket, getTicketRow } from "@/lib/tickets/service";
import { setOwnerName } from "@/lib/profile/service";

/** Toutes les actions de l'assistant : réservées à toi, et rien n'est créé ni envoyé sans ton clic. */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const id = z.uuid();
const instruction = z.string().trim().max(500).optional();

// ─── Mails ───────────────────────────────────────────────────────────

export async function draftMailReplyAction(itemId: string, hint?: string): Promise<Result<string>> {
  const { db } = await requireOwner();
  const mail = await getMail(db, id.parse(itemId));
  if (!mail) return { ok: false, error: "Mail introuvable." };
  try {
    // Le contenu complet donne un bien meilleur brouillon que l'aperçu.
    const email = await loadMessageBody(db, mail.email).catch(() => mail.email);
    return { ok: true, value: await draftMailReply(db, email, mail.item.client_id, instruction.parse(hint)) };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "brouillon de mail") };
  }
}

export async function sendMailReplyAction(itemId: string, body: string): Promise<Result<{ warnings: string[] }>> {
  const { db } = await requireOwner();
  const text = z.string().trim().min(2, "La réponse est vide.").max(50_000).safeParse(body);
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? "Réponse invalide." };
  const mail = await getMail(db, id.parse(itemId));
  if (!mail) return { ok: false, error: "Mail introuvable." };
  try {
    const email = await loadMessageBody(db, mail.email).catch(() => mail.email);
    const res = await sendMailReply(db, email, { body: text.data });
    revalidatePath("/inbox");
    revalidatePath("/");
    return { ok: true, value: res };
  } catch (err) {
    if (err instanceof MailSendError) return { ok: false, error: err.message };
    console.error("[mail] envoi de réponse", err);
    return { ok: false, error: "L'envoi a échoué. Réessaie." };
  }
}

// ─── Tickets et tâches ───────────────────────────────────────────────

export async function draftTicketReplyAction(ticketId: string, hint?: string): Promise<Result<string>> {
  const { db } = await requireOwner();
  const ticket = await getTicketRow(db, id.parse(ticketId));
  if (!ticket) return { ok: false, error: "Ticket introuvable." };
  try {
    return { ok: true, value: await draftTicketReply(db, ticket, instruction.parse(hint)) };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "brouillon de ticket") };
  }
}

export async function splitTaskAction(ticketId: string): Promise<Result<{ title: string; description: string }[]>> {
  const { db } = await requireOwner();
  const ticket = await getTicketRow(db, id.parse(ticketId));
  if (!ticket) return { ok: false, error: "Tâche introuvable." };
  try {
    return { ok: true, value: await splitTask(db, ticket) };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "découpage") };
  }
}

const newTasks = z.array(z.object({ title: z.string().trim().min(2).max(200), description: z.string().trim().max(5000) })).min(1).max(10);

/** Crée les sous-tâches retenues dans le même espace et le même projet que la tâche d'origine. */
export async function createSubtasksAction(ticketId: string, picked: unknown): Promise<Result<number>> {
  const { db } = await requireOwner();
  const parent = await getTicketRow(db, id.parse(ticketId));
  if (!parent) return { ok: false, error: "Tâche introuvable." };
  const parsed = newTasks.safeParse(picked);
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };
  for (const t of parsed.data) {
    const description = [t.description, `Sous-tâche de #${parent.number} « ${parent.subject} ».`].filter(Boolean).join("\n\n");
    await createTicket(db, {
      kind: "task",
      clientId: parent.client_id,
      projectId: parent.project_id,
      author: "admin",
      subject: t.title,
      body: description,
      task: { description, priority: parent.priority, labels: parent.labels },
    });
  }
  revalidatePath(`/espaces/${parent.client_id}`);
  revalidatePath(`/tickets/${parent.id}`);
  revalidatePath("/");
  return { ok: true, value: parsed.data.length };
}

// ─── Projets ─────────────────────────────────────────────────────────

async function projectInWorkspace(db: Awaited<ReturnType<typeof requireOwner>>["db"], workspaceId: string, projectId: string | null) {
  if (!projectId) return true;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.client_id, workspaceId)));
  return !!p;
}

export async function projectIdeasAction(workspaceId: string, projectId: string | null): Promise<Result<Idea[]>> {
  const { db } = await requireOwner();
  const ws = id.parse(workspaceId);
  const pid = projectId ? id.parse(projectId) : null;
  if (!(await projectInWorkspace(db, ws, pid))) return { ok: false, error: "Projet introuvable dans cet espace." };
  try {
    return { ok: true, value: await projectIdeas(db, ws, pid) };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "idées de projet") };
  }
}

/** Une idée retenue devient une tâche du backlog. */
export async function ideaToTaskAction(workspaceId: string, projectId: string | null, idea: unknown): Promise<Result<number>> {
  const { db } = await requireOwner();
  const ws = id.parse(workspaceId);
  const pid = projectId ? id.parse(projectId) : null;
  if (!(await projectInWorkspace(db, ws, pid))) return { ok: false, error: "Projet introuvable dans cet espace." };
  const parsed = z.object({ title: z.string().trim().min(2).max(200), why: z.string().trim().max(2000) }).safeParse(idea);
  if (!parsed.success) return { ok: false, error: "Idée invalide." };
  const description = `${parsed.data.why}\n\nIdée proposée par l'assistant.`;
  const ticket = await createTicket(db, {
    kind: "task",
    clientId: ws,
    projectId: pid,
    author: "admin",
    subject: parsed.data.title,
    body: description,
    task: { status: "backlog", description, labels: ["idée"] },
  });
  revalidatePath(`/espaces/${ws}`);
  return { ok: true, value: ticket.number };
}

// ─── Aujourd'hui et réglages ─────────────────────────────────────────

export async function generateBriefAction(): Promise<Result<Brief>> {
  const { db } = await requireOwner();
  try {
    const brief = await generateTodayBrief(db);
    revalidatePath("/");
    return { ok: true, value: brief };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "résumé du matin") };
  }
}

export async function saveWritingStyleAction(_prev: { message?: string } | null, formData: FormData) {
  const { db } = await requireOwner();
  await setWritingStyle(db, z.string().max(4000).parse(formData.get("style") ?? ""));
  revalidatePath("/reglages");
  return { message: "Enregistré : l'assistant écrira dans ce ton." };
}

export async function saveOwnerNameAction(_prev: { message?: string } | null, formData: FormData) {
  const { db } = await requireOwner();
  await setOwnerName(db, z.string().max(80).parse(formData.get("name") ?? ""));
  revalidatePath("/", "layout");
  return { message: "Enregistré : les membres verront ce nom." };
}
