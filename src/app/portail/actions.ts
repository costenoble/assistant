"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPortalProject, getPortalTicket, resolvePortalTicketTarget } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { WORKSPACE_COLORS } from "@/lib/db/types";
import { createProject } from "@/lib/projects/service";
import { notify } from "@/lib/notifications/service";
import { notifyOwnerOfClientMessage } from "@/lib/tickets/notify";
import { addTicketMessage, clientValidateTask, createTicket } from "@/lib/tickets/service";

/**
 * Actions du portail. Chacune repart de requireClient() et vérifie, via
 * lib/auth/access, que le contact agit sur ses propres clients et projets.
 */

export type PortalFormState = { error?: string; sent?: number } | null;

const optionalId = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());

export async function createRequest(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const parsed = z
    .object({
      subject: z.string().trim().min(3, "Indiquez un objet (3 caractères minimum).").max(200),
      body: z.string().trim().min(1, "Décrivez votre demande.").max(20_000),
      client_id: optionalId,
      project_id: optionalId,
      urgent: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const target = await resolvePortalTicketTarget(db, clientIds, {
    clientId: parsed.data.client_id,
    projectId: parsed.data.project_id,
  });
  if (!target) return { error: "Choisissez l'entreprise ou le projet concerné." };

  const ticket = await createTicket(db, {
    clientId: target.clientId,
    projectId: target.projectId,
    contactId: contact.id,
    author: "client",
    subject: parsed.data.subject,
    body: parsed.data.body,
    urgent: parsed.data.urgent === "on",
  });
  await notifyOwnerOfClientMessage(db, ticket, parsed.data.body, "new", contact.full_name);
  revalidatePath("/portail");
  redirect(`/portail/demandes/${ticket.id}?envoye=1`);
}

export async function replyToRequest(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const body = z.string().trim().min(1, "Votre message est vide.").max(20_000).safeParse(formData.get("body"));
  if (!body.success) return { error: body.error.issues[0]?.message };
  const tid = z.uuid().safeParse(formData.get("ticket_id"));
  // Même message qu'un ticket inexistant : on ne révèle pas les demandes des autres clients.
  if (!tid.success || !(await getPortalTicket(db, clientIds, tid.data))) return { error: "Demande introuvable." };

  const { ticket } = await addTicketMessage(db, tid.data, { author: "client", contactId: contact.id, body: body.data });
  await notifyOwnerOfClientMessage(db, ticket, body.data, "reply", contact.full_name);
  revalidatePath(`/portail/demandes/${tid.data}`);
  revalidatePath("/portail", "layout");
  return { sent: Date.now() };
}

/** Le contact confie une tâche sur un projet qu'il voit. */
export async function createTask(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const parsed = z
    .object({
      workspace_id: z.uuid(),
      project_id: optionalId,
      subject: z.string().trim().min(3, "Donnez un titre à la tâche (3 caractères minimum).").max(200),
      body: z.string().trim().max(20_000).optional(),
      urgent: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  // L'espace doit être l'un des siens ; le projet, s'il y en a un, visible (même espace, hors brouillon).
  const workspaceId = parsed.data.workspace_id;
  if (!clientIds.includes(workspaceId)) return { error: "Espace introuvable." };
  const visible = parsed.data.project_id ? await getPortalProject(db, clientIds, parsed.data.project_id) : null;
  if (parsed.data.project_id && (!visible || visible.project.client_id !== workspaceId)) return { error: "Projet introuvable." };

  const body = parsed.data.body || parsed.data.subject;
  const ticket = await createTicket(db, {
    kind: "task",
    clientId: workspaceId,
    projectId: visible?.project.id ?? null,
    contactId: contact.id,
    author: "client",
    subject: parsed.data.subject,
    body,
    urgent: parsed.data.urgent === "on",
  });
  await notifyOwnerOfClientMessage(db, ticket, body, "new", contact.full_name);
  revalidatePath(`/portail/espaces/${workspaceId}`);
  if (visible) revalidatePath(`/portail/projets/${visible.project.id}`);
  return { sent: Date.now() };
}

/** Le contact valide une tâche qu'on lui a soumise. */
export async function validateTask(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const tid = z.uuid().safeParse(formData.get("ticket_id"));
  const visible = tid.success ? await getPortalTicket(db, clientIds, tid.data) : null;
  if (!visible || visible.kind !== "task") return { error: "Tâche introuvable." };
  const ticket = await clientValidateTask(db, visible.id, contact.id);
  if (!ticket) return { error: "Cette tâche n'attend plus de validation." };
  await notifyOwnerOfClientMessage(db, ticket, "", "validated", contact.full_name);
  revalidatePath(`/portail/demandes/${visible.id}`);
  if (visible.project_id) revalidatePath(`/portail/projets/${visible.project_id}`);
  revalidatePath(`/portail/espaces/${visible.client_id}`);
  return { sent: Date.now() };
}

/** Un membre crée un projet dans l'un de ses espaces : visible tout de suite, tu es prévenu. */
export async function createProjectFromPortal(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string } | null> {
  const { db, contact, clientIds } = await requireClient();
  const parsed = z
    .object({
      workspace_id: z.uuid(),
      name: z.string().trim().min(1, "Donnez un nom au projet.").max(120),
      color: z.enum(WORKSPACE_COLORS).default("blue"),
      description: z.string().trim().max(2000).optional().transform((v) => v || null),
      due_on: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const f = parsed.data;
  if (!clientIds.includes(f.workspace_id)) return { error: "Espace introuvable." };
  const p = await createProject(db, f.workspace_id, { name: f.name, color: f.color, description: f.description, dueOn: f.due_on }, contact.id);
  await notify(db, { kind: "client_project", title: `Nouveau projet — ${p.name}`, body: `${contact.full_name} a créé ce projet.`, url: `/projets/${p.id}`, tag: `project-${p.id}` });
  revalidatePath(`/portail/espaces/${f.workspace_id}`);
  redirect(`/portail/projets/${p.id}`);
}
