"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { projectMilestones, projects } from "@/lib/db/schema";
import { PROJECT_HEALTHS, PROJECT_STATUSES, WORKSPACE_COLORS } from "@/lib/db/types";
import { aiErrorMessage } from "@/lib/ai/claude";
import { draftProjectUpdate } from "@/lib/ai/assistant";
import { notifyMembersOfUpdate } from "@/lib/projects/notify";
import { addMilestone, createProject, deleteMilestone, leadAllowed, postProjectUpdate, updateProject } from "@/lib/projects/service";

export type ProjectFormState = { error?: string; message?: string } | null;

const id = z.uuid();
const optionalDate = z.union([z.iso.date(), z.literal("")]).optional().transform((v) => v || null);
const optionalText = z.string().trim().max(2000).optional().transform((v) => v || null);

function refresh(workspaceId: string, projectId?: string) {
  revalidatePath(`/espaces/${workspaceId}`);
  if (projectId) revalidatePath(`/projets/${projectId}`);
  revalidatePath("/espaces");
}

async function projectRow(db: Awaited<ReturnType<typeof requireOwner>>["db"], projectId: string) {
  const [p] = await db.select().from(projects).where(eq(projects.id, id.parse(projectId)));
  return p ?? null;
}

export async function createProjectAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      workspace_id: z.uuid(),
      name: z.string().trim().min(1, "Donne un nom au projet.").max(120),
      color: z.enum(WORKSPACE_COLORS).default("blue"),
      description: optionalText,
      due_on: optionalDate,
      lead: z.string().optional().transform((v) => (v ? v : "owner")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const f = parsed.data;
  if (!(await leadAllowed(db, f.workspace_id, f.lead))) return { error: "Responsable inconnu dans cet espace." };
  const p = await createProject(db, f.workspace_id, { name: f.name, color: f.color, description: f.description, dueOn: f.due_on, lead: f.lead, status: "active" });
  refresh(f.workspace_id, p.id);
  redirect(`/projets/${p.id}`);
}

export async function updateProjectAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      project_id: z.uuid(),
      name: z.string().trim().min(1, "Donne un nom au projet.").max(120),
      color: z.enum(WORKSPACE_COLORS),
      description: optionalText,
      due_on: optionalDate,
      status: z.enum(PROJECT_STATUSES),
      lead: z.string().optional().transform((v) => (v === "owner" ? "owner" : v ? v : null)),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const f = parsed.data;
  const p = await projectRow(db, f.project_id);
  if (!p) return { error: "Projet introuvable." };
  if (!(await leadAllowed(db, p.client_id, f.lead))) return { error: "Responsable inconnu dans cet espace." };
  await updateProject(db, p.id, { name: f.name, color: f.color, description: f.description, dueOn: f.due_on, status: f.status, lead: f.lead });
  refresh(p.client_id, p.id);
  return { message: "Enregistré." };
}

export async function addMilestoneAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({ project_id: z.uuid(), name: z.string().trim().min(1, "Nomme le jalon.").max(120), due_on: optionalDate })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const p = await projectRow(db, parsed.data.project_id);
  if (!p) return { error: "Projet introuvable." };
  await addMilestone(db, p.id, parsed.data.name, parsed.data.due_on);
  refresh(p.client_id, p.id);
  return { message: "Jalon ajouté." };
}

export async function deleteMilestoneAction(milestoneId: string) {
  const { db } = await requireOwner();
  const [m] = await db.select({ project_id: projectMilestones.project_id }).from(projectMilestones).where(eq(projectMilestones.id, id.parse(milestoneId)));
  if (!m) return;
  const p = await projectRow(db, m.project_id);
  await deleteMilestone(db, milestoneId);
  if (p) refresh(p.client_id, p.id);
}

export async function postUpdateAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      project_id: z.uuid(),
      health: z.enum(PROJECT_HEALTHS),
      body: z.string().trim().min(3, "Écris quelques mots sur l'avancement.").max(10_000),
      notify: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const p = await projectRow(db, parsed.data.project_id);
  if (!p) return { error: "Projet introuvable." };
  const update = await postProjectUpdate(db, p.id, parsed.data.health, parsed.data.body);
  // Un projet en brouillon reste privé : pas d'email aux membres.
  const sent = parsed.data.notify === "on" && p.status !== "draft" ? await notifyMembersOfUpdate(db, p, update) : 0;
  refresh(p.client_id, p.id);
  return { message: sent ? `Publié et envoyé à ${sent} membre${sent > 1 ? "s" : ""}.` : "Publié." };
}

export async function draftUpdateAction(projectId: string): Promise<{ ok: true; health: (typeof PROJECT_HEALTHS)[number]; body: string } | { ok: false; error: string }> {
  const { db } = await requireOwner();
  try {
    const r = await draftProjectUpdate(db, id.parse(projectId));
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: aiErrorMessage(err, "point d'avancement") };
  }
}
