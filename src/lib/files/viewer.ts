import "server-only";
import { getDb } from "@/lib/db";
import { getPortalAccess } from "@/lib/auth/access";
import { isOwnerEmail } from "@/lib/auth/require-owner";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Qui fait la requête, sans redirection (pour les routes de fichiers) :
 * toi, un membre (avec ses espaces), ou personne.
 */
export async function getViewer() {
  const user = await getSessionUser();
  if (!user) return null;
  const db = getDb();
  if (isOwnerEmail(user.email)) return { kind: "owner" as const, db };
  const access = await getPortalAccess(db, user.email);
  if (!access) return null;
  return { kind: "member" as const, db, contact: access.contact, clientIds: access.clientIds };
}
export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;
