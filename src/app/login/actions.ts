"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type LoginState = { ok: boolean; message: string } | null;

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Adresse email invalide." };

  // Message identique dans tous les cas : on ne révèle pas quel email est autorisé.
  const generic = { ok: true, message: "Si cette adresse est autorisée, un lien de connexion vient d'être envoyé." };
  if (email.data.toLowerCase() !== env().OWNER_EMAIL.toLowerCase()) return generic;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) return { ok: false, message: `Envoi impossible : ${error.message}` };
  return generic;
}
