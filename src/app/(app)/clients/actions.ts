"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isOwnerEmail, requireOwner } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { supabase, user } = await requireOwner();
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
  const slug = base.length >= 2 ? base : `${base}-client`;
  const { data, error } = await supabase
    .from("clients")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug,
      status: parsed.data.status,
      website: parsed.data.website,
      email_domains: parseDomains(parsed.data.email_domains),
    })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Un client porte déjà ce nom." : error.message };
  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({ status: z.enum(CLIENT_STATUSES), website: optionalText(300), email_domains: z.string().optional() })
    .parse(Object.fromEntries(formData));
  await supabase
    .from("clients")
    .update({ status: parsed.status, website: parsed.website, email_domains: parseDomains(parsed.email_domains) })
    .eq("id", id.parse(clientId));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

// ─── Contacts ───────────────────────────────────────────────────────

export async function addContact(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireOwner();
  const parsed = z
    .object({
      full_name: z.string().trim().min(1, "Nom obligatoire").max(200),
      email: z.union([z.email("Email invalide"), z.literal("")]).transform((v) => v.toLowerCase() || null),
      phone: optionalText(40),
      job_title: optionalText(100),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const { error } = await supabase
    .from("client_contacts")
    .insert({ owner_id: user.id, client_id: id.parse(clientId), ...parsed.data });
  if (error) return { error: error.code === "23505" ? "Ce contact existe déjà pour ce client." : error.message };
  revalidatePath(`/clients/${clientId}`);
  return { message: "Contact ajouté." };
}

export async function deleteContact(contactId: string, clientId: string) {
  const { supabase } = await requireOwner();
  await supabase.from("client_contacts").delete().eq("id", id.parse(contactId));
  revalidatePath(`/clients/${clientId}`);
}

/** Compte Supabase du contact : retrouvé s'il existe, créé sinon (les inscriptions publiques restent fermées). */
async function findOrCreateAuthUser(email: string): Promise<string> {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;

  // Déjà inscrit : on le retrouve (peu de comptes dans une app comme celle-ci).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(created.error?.message ?? "Impossible de créer le compte");
}

export async function setPortalAccess(contactId: string, enabled: boolean): Promise<FormState> {
  const { supabase } = await requireOwner();
  const { data: contact } = await supabase
    .from("client_contacts")
    .select("id, client_id, email, user_id")
    .eq("id", id.parse(contactId))
    .single();
  if (!contact) return { error: "Contact introuvable" };

  if (!enabled) {
    await supabase.from("client_contacts").update({ portal_access: false }).eq("id", contact.id);
    revalidatePath(`/clients/${contact.client_id}`);
    return { message: "Accès retiré : le contact ne voit plus rien dès maintenant." };
  }

  if (!contact.email) return { error: "Ajoute d'abord un email à ce contact." };
  if (isOwnerEmail(contact.email)) return { error: "C'est ton adresse admin." };

  try {
    const userId = contact.user_id ?? (await findOrCreateAuthUser(contact.email));
    await supabase.from("client_contacts").update({ portal_access: true, user_id: userId }).eq("id", contact.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/clients/${contact.client_id}`);
  return {
    message: `Accès ouvert. ${contact.email} peut se connecter sur ${env().NEXT_PUBLIC_APP_URL}/login (lien magique).`,
  };
}

// ─── Projets ────────────────────────────────────────────────────────

export async function addProject(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireOwner();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Nom obligatoire").max(200),
      description: optionalText(5000),
      due_on: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const { error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, client_id: id.parse(clientId), status: "draft", ...parsed.data });
  if (error) return { error: error.message };
  revalidatePath(`/clients/${clientId}`);
  return { message: "Projet créé en brouillon (invisible du client tant que tu ne changes pas son statut)." };
}

export async function setProjectStatus(projectId: string, clientId: string, status: string) {
  const { supabase } = await requireOwner();
  await supabase
    .from("projects")
    .update({ status: z.enum(PROJECT_STATUSES).parse(status) })
    .eq("id", id.parse(projectId));
  revalidatePath(`/clients/${clientId}`);
}
