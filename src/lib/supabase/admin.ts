import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let admin: SupabaseClient | undefined;

/**
 * Client service_role : contourne la RLS. Réservé au cron, à l'ingestion
 * et aux callbacks OAuth. Ne jamais l'utiliser pour servir une page.
 */
export function createAdminClient(): SupabaseClient {
  admin ??= createClient(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
