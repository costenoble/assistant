import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getPortalAccess } from "./access";
import { isOwnerEmail } from "./require-owner";
import { getSessionUser } from "./session";

/**
 * Garde du portail client. L'accès est relu en base à chaque requête :
 * le retirer sur la fiche du contact prend effet immédiatement.
 * Renvoie `clientIds`, à passer aux lectures de lib/auth/access.
 */
export async function requireClient() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isOwnerEmail(user.email)) redirect("/");

  const db = getDb();
  const access = await getPortalAccess(db, user.email);
  if (!access) redirect("/login?error=acces-retire");
  return { db, user, ...access };
}
