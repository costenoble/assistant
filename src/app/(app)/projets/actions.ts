"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { projects } from "@/lib/db/schema";
import { notifyClientOfReply } from "@/lib/tickets/notify";
import { createTicket } from "@/lib/tickets/service";

export type TaskFormState = { error?: string; message?: string } | null;

/** L'admin ajoute une tâche à un projet. `share` : prévenir le client par email. */
export async function createProjectTask(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      project_id: z.uuid(),
      subject: z.string().trim().min(2, "Donne un titre à la tâche.").max(200),
      body: z.string().trim().max(20_000).optional(),
      share: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.project_id));
  if (!project) return { error: "Projet introuvable" };

  const body = parsed.data.body || parsed.data.subject;
  const ticket = await createTicket(db, {
    kind: "task",
    clientId: project.client_id,
    projectId: project.id,
    author: "admin",
    subject: parsed.data.subject,
    body,
  });
  const shared = parsed.data.share === "on" && project.status !== "draft";
  if (shared) await notifyClientOfReply(db, ticket, body, { isNew: true });
  revalidatePath(`/projets/${project.id}`);
  revalidatePath("/");
  return { message: shared ? "Tâche ajoutée, le client est prévenu." : "Tâche ajoutée." };
}
