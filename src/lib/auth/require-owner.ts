import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { sameEmail } from "./access";
import { getSessionUser } from "./session";

export function isOwnerEmail(email: string | null | undefined) {
  return sameEmail(email, env().OWNER_EMAIL);
}

/**
 * Garantit que la requête vient de l'admin. Sans session : /login.
 * Un compte client est renvoyé vers son portail.
 */
export async function requireOwner() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isOwnerEmail(user.email)) redirect("/portail");
  return { db: getDb(), user };
}
