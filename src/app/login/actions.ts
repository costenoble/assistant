"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/auth/require-owner";
import { env } from "@/lib/env";

export type LoginState = { ok: boolean; message: string } | null;

/** Un contact client peut se connecter s'il a un accès portail actif (compte déjà créé par l'admin). */
async function hasPortalAccess(email: string) {
  const { data } = await createAdminClient()
    .from("client_contacts")
    .select("id")
    .eq("email", email)
    .eq("portal_access", true)
    .not("user_id", "is", null)
    .limit(1);
  return !!data?.length;
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, message: "Adresse email invalide." };
  const email = parsed.data.toLowerCase();

  // Message identique dans tous les cas : on ne révèle pas quelles adresses sont autorisées.
  const generic = { ok: true, message: "Si cette adresse est autorisée, un lien de connexion vient d'être envoyé." };
  const owner = isOwnerEmail(email);
  if (!owner && !(await hasPortalAccess(email))) return generic;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback`,
      // Seul l'admin peut créer son compte au 1er lien ; les comptes clients sont créés depuis la fiche client.
      shouldCreateUser: owner,
    },
  });
  if (error) return { ok: false, message: owner ? `Envoi impossible : ${error.message}` : generic.message };
  return generic;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
