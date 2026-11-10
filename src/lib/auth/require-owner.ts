import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Garantit que la requête vient du propriétaire ; sinon redirige vers /login. */
export async function requireOwner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.email?.toLowerCase() !== env().OWNER_EMAIL.toLowerCase()) {
    redirect("/login");
  }
  return { supabase, user };
}
