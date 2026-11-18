"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import type { Db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { TASK_PRIORITIES, TICKET_STATUSES, WORKSPACE_COLORS, WORKSPACE_KINDS, type Ticket } from "@/lib/db/types";
import { notifyAssignee, notifyClientOfReply } from "@/lib/tickets/notify";
import { createTicket, getTicketRow, moveTask, updateTask, type TaskFields } from "@/lib/tickets/service";
import { deleteWorkspace } from "@/lib/workspaces/delete";

export type FormState = { error?: string; message?: string } | null;

const id = z.uuid();
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

function refresh(workspaceId: string, ticketId?: string) {
  revalidatePath(`/espaces/${workspaceId}`);
  revalidatePath("/espaces");
  revalidatePath("/");
  if (ticketId) revalidatePath(`/tickets/${ticketId}`);
}

/** Prévient qui doit l'être après un changement fait par l'admin. */
async function notifyChange(db: Db, before: Ticket, after: Ticket) {
  if (after.assignee_contact_id && after.assignee_contact_id !== before.assignee_contact_id) await notifyAssignee(db, after);
  if (after.status === "waiting_client" && before.status !== "waiting_client") {
    await notifyClientOfReply(db, after, "Cette tâche est prête : elle attend votre validation.");
  }
}

/** Le contact (ou "owner") doit appartenir à l'espace de la tâche. */
async function assigneeAllowed(db: Db, workspaceId: string, assignee: string | null) {
  if (assignee === null || assignee === "owner") return true;
  const [c] = await db
    .select({ id: clientContacts.id })
    .from(clientContacts)
    .where(and(eq(clientContacts.id, assignee), eq(clientContacts.client_id, workspaceId)));
  return !!c;
}

async function projectAllowed(db: Db, workspaceId: string, projectId: string | null) {
  if (!projectId) return true;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.client_id, workspaceId)));
  return !!p;
}

// ─── Espaces ────────────────────────────────────────────────────────

export async function createWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Donne un nom à l'espace.").max(120),
      kind: z.enum(WORKSPACE_KINDS),
      color: z.enum(WORKSPACE_COLORS),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const base = slugify(parsed.data.name) || "espace";
  let createdId: string;
  try {
    const [created] = await db
      .insert(clients)
      .values({ name: parsed.data.name, slug: base.length >= 2 ? base : `${base}-espace`, kind: parsed.data.kind, color: parsed.data.color })
      .returning({ id: clients.id });
    createdId = created!.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Un espace porte déjà ce nom." };
    throw err;
  }
  revalidatePath("/espaces");
  redirect(`/espaces/${createdId}`);
}

export async function setWorkspaceColor(workspaceId: string, color: string) {
  const { db } = await requireOwner();
  await db.update(clients).set({ color: z.enum(WORKSPACE_COLORS).parse(color) }).where(eq(clients.id, id.parse(workspaceId)));
  refresh(workspaceId);
}

// ─── Tâches ─────────────────────────────────────────────────────────

const labelsField = z
  .string()
  .optional()
  .transform((v) => (v ?? "").split(",").map((l) => l.trim()).filter(Boolean));

export async function createWorkspaceTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      workspace_id: z.uuid(),
      subject: z.string().trim().min(2, "Donne un titre à la tâche.").max(200),
      description: z.string().trim().max(20_000).optional(),
      status: z.enum(TICKET_STATUSES).default("open"),
      priority: z.enum(TASK_PRIORITIES).default("none"),
      assignee: z.string().optional().transform((v) => (v ? v : null)),
      project_id: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
      due_on: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || null),
      labels: labelsField,
      notify: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const f = parsed.data;
  if (!(await assigneeAllowed(db, f.workspace_id, f.assignee))) return { error: "Assigné inconnu dans cet espace." };
  if (!(await projectAllowed(db, f.workspace_id, f.project_id))) return { error: "Projet inconnu dans cet espace." };

  const description = f.description || null;
  const ticket = await createTicket(db, {
    kind: "task",
    clientId: f.workspace_id,
    projectId: f.project_id,
    author: "admin",
    subject: f.subject,
    body: description ?? f.subject,
    task: { status: f.status, priority: f.priority, assignee: f.assignee, dueOn: f.due_on, labels: f.labels, description },
  });
  if (ticket.assignee_contact_id) await notifyAssignee(db, ticket);
  else if (f.notify === "on") await notifyClientOfReply(db, ticket, description ?? f.subject, { isNew: true });
  refresh(f.workspace_id);
  return { message: `Tâche #${ticket.number} créée.` };
}

/** Glisser-déposer sur le tableau. */
export async function moveTaskAction(ticketId: string, status: string, position: number) {
  const { db } = await requireOwner();
  const before = await getTicketRow(db, id.parse(ticketId));
  if (!before || before.kind !== "task") return;
  const after = await moveTask(db, before.id, z.enum(TICKET_STATUSES).parse(status), z.number().finite().parse(position));
  if (after) await notifyChange(db, before, after);
  refresh(before.client_id, before.id);
}

/** Modification d'une propriété depuis la page d'une tâche. */
export async function updateTaskField(ticketId: string, field: string, value: string | null) {
  const { db } = await requireOwner();
  const before = await getTicketRow(db, id.parse(ticketId));
  if (!before) return;
  const v = value ?? "";
  let patch: TaskFields & { subject?: string };
  switch (field) {
    case "status":
      patch = { status: z.enum(TICKET_STATUSES).parse(v) };
      break;
    case "priority":
      patch = { priority: z.enum(TASK_PRIORITIES).parse(v) };
      break;
    case "assignee":
      if (!(await assigneeAllowed(db, before.client_id, v || null))) return;
      patch = { assignee: v || null };
      break;
    case "project":
      if (!(await projectAllowed(db, before.client_id, v || null))) return;
      patch = { projectId: v || null };
      break;
    case "due_on":
      patch = { dueOn: v ? z.iso.date().parse(v) : null };
      break;
    case "labels":
      patch = { labels: labelsField.parse(v) };
      break;
    case "subject":
      patch = { subject: z.string().trim().min(2).max(200).parse(v) };
      break;
    case "description":
      patch = { description: z.string().trim().max(20_000).parse(v) || null };
      break;
    default:
      return;
  }
  const after = await updateTask(db, before.id, patch);
  if (after) await notifyChange(db, before, after);
  refresh(before.client_id, before.id);
}

export async function updateWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({ workspace_id: z.uuid(), name: z.string().trim().min(1, "Donne un nom à l'espace.").max(120), color: z.enum(WORKSPACE_COLORS) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  await db.update(clients).set({ name: parsed.data.name, color: parsed.data.color }).where(eq(clients.id, parsed.data.workspace_id));
  refresh(parsed.data.workspace_id);
  return { message: "Enregistré." };
}

/** Suppression définitive : il faut retaper le nom exact de l'espace. */
export async function deleteWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const wsId = id.parse(formData.get("workspace_id"));
  const [ws] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, wsId));
  if (!ws) return { error: "Espace introuvable." };
  if (String(formData.get("confirm") ?? "").trim() !== ws.name) return { error: `Tape exactement « ${ws.name} » pour confirmer.` };
  await deleteWorkspace(db, wsId);
  revalidatePath("/", "layout");
  redirect("/espaces?supprime=1");
}
