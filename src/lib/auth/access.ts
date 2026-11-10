import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";

/**
 * Qui a accès à quoi. C'est LE point de passage du portail : toute lecture
 * faite pour un client part de `getPortalAccess` et reste bornée à ses
 * `clientIds`. Aucune page du portail ne doit interroger la base autrement.
 */

export function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Contacts actifs (accès portail ouvert) pour cette adresse, avec leur client. */
export async function getPortalAccess(db: Db, email: string) {
  const rows = await db
    .select({ contact: clientContacts, client: clients })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.client_id))
    .where(
      and(
        eq(clientContacts.email, email.trim().toLowerCase()),
        eq(clientContacts.portal_access, true),
        ne(clients.status, "archived"),
      ),
    )
    .orderBy(clients.name);
  if (!rows.length) return null;
  return {
    contact: rows[0]!.contact,
    clients: rows.map((r) => r.client),
    clientIds: rows.map((r) => r.client.id),
  };
}

/** Cette adresse peut-elle recevoir un lien de connexion ? (admin ou contact avec accès portail) */
export async function canSignIn(db: Db, email: string, ownerEmail: string) {
  return sameEmail(email, ownerEmail) || (await getPortalAccess(db, email)) !== null;
}

/** Projets visibles par un client : les siens, hors brouillons. */
export async function getPortalProjects(db: Db, clientIds: string[]) {
  if (!clientIds.length) return [];
  return db
    .select()
    .from(projects)
    .where(and(inArray(projects.client_id, clientIds), ne(projects.status, "draft")))
    .orderBy(desc(projects.updated_at));
}
