import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, items, meetings, projects, tickets } from "@/lib/db/schema";

/** Ce qui disparaît avec un espace, pour l'afficher avant de confirmer. */
export async function workspaceFootprint(db: Db, workspaceId: string) {
  const [p, t, m, c] = await Promise.all([
    db.$count(projects, eq(projects.client_id, workspaceId)),
    db.$count(tickets, eq(tickets.client_id, workspaceId)),
    db.$count(meetings, eq(meetings.client_id, workspaceId)),
    db.$count(clientContacts, eq(clientContacts.client_id, workspaceId)),
  ]);
  return { projects: p, tickets: t, meetings: m, contacts: c };
}

/**
 * Supprime un espace et tout ce qui lui appartient (projets, tâches et
 * demandes avec leurs échanges, réunions, membres et leurs accès, notes).
 * Les mails reçus restent dans la boîte, simplement détachés de l'espace.
 */
export async function deleteWorkspace(db: Db, workspaceId: string) {
  await db.transaction(async (tx) => {
    // Les copies des tâches dans « Aujourd'hui » ne sont pas liées en cascade : on les retire d'abord.
    const mirrored = await tx.select({ item_id: tickets.item_id }).from(tickets).where(eq(tickets.client_id, workspaceId));
    const ids = mirrored.map((r) => r.item_id).filter((x): x is string => !!x);
    if (ids.length) await tx.delete(items).where(inArray(items.id, ids));
    await tx.delete(clients).where(eq(clients.id, workspaceId));
  });
}
