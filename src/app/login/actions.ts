"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canSignIn } from "@/lib/auth/access";
import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";

export type LoginState = { ok: boolean; message: string } | null;

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, message: "Adresse email invalide." };
  const email = parsed.data.toLowerCase();

  // Message identique dans tous les cas : on ne révèle pas quelles adresses sont autorisées.
  const generic = { ok: true, message: "Si cette adresse est autorisée, un lien de connexion vient d'être envoyé." };
  if (!(await canSignIn(getDb(), email, env().OWNER_EMAIL))) return generic;

  try {
    await getAuth().api.signInMagicLink({
      body: { email, callbackURL: "/", errorCallbackURL: "/login" },
      headers: await headers(),
    });
  } catch (err) {
    console.error("[login]", err);
    return { ok: false, message: "L'envoi du lien a échoué. Réessayez dans un instant." };
  }
  return generic;
}

export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
