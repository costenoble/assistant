import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export function isOwnerEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase() === env().OWNER_EMAIL.toLowerCase();
}

// Une fois par instance serveur suffit : la ligne ne disparaît pas.
let adminRowEnsured = false;

/**
 * La RLS identifie l'admin via la table `admins` (is_admin()). On l'y
 * inscrit ici, côté serveur, après avoir vérifié OWNER_EMAIL : aucune
 * étape SQL manuelle, et personne d'autre ne peut s'y ajouter.
 */
export async function ensureAdminRow(userId: string) {
  if (adminRowEnsured) return;
  const { error } = await createAdminClient().from("admins").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (error) throw new Error(`admins : ${error.message}`);
  adminRowEnsured = true;
}

/** Garantit que la requête vient du propriétaire ; sinon redirige vers /login. */
export async function requireOwner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !isOwnerEmail(user.email)) {
    redirect("/login");
  }
  await ensureAdminRow(user.id);
  return { supabase, user };
}
