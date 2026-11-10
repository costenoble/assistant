import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, ClientContact } from "@/lib/db/types";
import { isOwnerEmail } from "./require-owner";

/**
 * Garde du portail client. Toutes les lectures passent par la session du
 * contact : la RLS (my_client_ids()) limite d'office à SES clients.
 * L'admin est renvoyé vers son interface.
 */
export async function requireClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");
  if (isOwnerEmail(user.email)) redirect("/");

  const [{ data: contacts }, { data: clients }] = await Promise.all([
    supabase.from("client_contacts").select("*").eq("user_id", user.id).eq("portal_access", true),
    supabase.from("clients").select("*").order("name"),
  ]);
  if (!contacts?.length || !clients?.length) redirect("/login?error=acces-retire");

  return {
    supabase,
    user,
    contact: contacts[0] as ClientContact,
    clients: clients as Client[],
  };
}
