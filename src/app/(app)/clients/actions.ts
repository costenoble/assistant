"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isOwnerEmail, requireOwner } from "@/lib/auth/require-owner";
import { isUniqueViolation } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { CLIENT_STATUSES, PROJECT_STATUSES } from "@/lib/db/types";
import { env } from "@/lib/env";

const id = z.uuid();
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null).nullish().transform((v) => v ?? null);

export type FormState = { error?: string; message?: string } | null;

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** « client.fr, @autre.com » → ["client.fr", "autre.com"] */
function parseDomains(raw: string | null | undefined) {
  return [...new Set((raw ?? "").split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
}

// ─── Clients ────────────────────────────────────────────────────────

export async function createClientRecord(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Nom obligatoire").max(200),
      website: optionalText(300),
      email_domains: z.string().optional(),
      status: z.enum(CLIENT_STATUSES),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const base = slugify(parsed.data.name) || "client";
  let createdId: string;
  try {
    const [created] = await db
      .insert(clients)
      .values({
        name: parsed.data.name,
        slug: base.length >= 2 ? base : `${base}-client`,
        status: parsed.data.status,
        website: parsed.data.website,
        email_domains: parseDomains(parsed.data.email_domains),
      })
      .returning({ id: clients.id });
    createdId = created!.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Un client porte déjà ce nom." };
    throw err;
  }
  revalidatePath("/clients");
  redirect(`/clients/${createdId}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  const { db } = await requireOwner();
  const parsed = z
    .object({ status: z.enum(CLIENT_STATUSES), website: optionalText(300), email_domains: z.string().optional() })
    .parse(Object.fromEntries(formData));
  await db
    .update(clients)
    .set({ status: parsed.status, website: parsed.website, email_domains: parseDomains(parsed.email_domains) })
    .where(eq(clients.id, id.parse(clientId)));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

// ─── Contacts ───────────────────────────────────────────────────────

export async function addContact(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      full_name: z.string().trim().min(1, "Nom obligatoire").max(200),
      email: z.union([z.email("Email invalide"), z.literal("")]).transform((v) => v.toLowerCase() || null),
      phone: optionalText(40),
      job_title: optionalText(100),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  try {
    await db.insert(clientContacts).values({ client_id: id.parse(clientId), ...parsed.data });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Ce contact existe déjà pour ce client." };
    throw err;
  }
  revalidatePath(`/clients/${clientId}`);
  return { message: "Contact ajouté." };
}

export async function deleteContact(contactId: string, clientId: string) {
  const { db } = await requireOwner();
  await db.delete(clientContacts).where(eq(clientContacts.id, id.parse(contactId)));
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Ouvre ou retire l'accès portail. Aucun compte à créer : le contact se
 * connecte par lien magique avec son email, tant que l'accès est ouvert.
 */
export async function setPortalAccess(contactId: string, enabled: boolean): Promise<FormState> {
  const { db } = await requireOwner();
  const [contact] = await db.select().from(clientContacts).where(eq(clientContacts.id, id.parse(contactId)));
  if (!contact) return { error: "Contact introuvable" };

  if (enabled) {
    if (!contact.email) return { error: "Ajoute d'abord un email à ce contact." };
    if (isOwnerEmail(contact.email)) return { error: "C'est ton adresse admin." };
  }
  await db.update(clientContacts).set({ portal_access: enabled }).where(eq(clientContacts.id, contact.id));
  revalidatePath(`/clients/${contact.client_id}`);
  return {
    message: enabled
      ? `Accès ouvert. ${contact.email} peut se connecter sur ${env().NEXT_PUBLIC_APP_URL}/login (lien magique).`
      : "Accès retiré : le contact ne voit plus rien dès maintenant.",
  };
}

// ─── Projets ────────────────────────────────────────────────────────

export async function addProject(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Nom obligatoire").max(200),
      description: optionalText(5000),
      due_on: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  await db.insert(projects).values({ client_id: id.parse(clientId), status: "draft", ...parsed.data });
  revalidatePath(`/clients/${clientId}`);
  return { message: "Projet créé en brouillon (invisible du client tant que tu ne changes pas son statut)." };
}

export async function setProjectStatus(projectId: string, clientId: string, status: string) {
  const { db } = await requireOwner();
  await db
    .update(projects)
    .set({ status: z.enum(PROJECT_STATUSES).parse(status) })
    .where(eq(projects.id, id.parse(projectId)));
  revalidatePath(`/clients/${clientId}`);
}
