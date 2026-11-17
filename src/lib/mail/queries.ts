import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clients, emailMessages, items } from "@/lib/db/schema";

/** Un mail avec son item et son client, pour la page de lecture. */
export async function getMail(db: Db, itemId: string) {
  const [row] = await db
    .select({ item: items, email: emailMessages, client: { id: clients.id, name: clients.name } })
    .from(items)
    .innerJoin(emailMessages, eq(emailMessages.item_id, items.id))
    .leftJoin(clients, eq(clients.id, items.client_id))
    .where(eq(items.id, itemId));
  return row ?? null;
}
