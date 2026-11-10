import "server-only";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientNotes, clients, emailMessages, items } from "@/lib/db/schema";
import type { ClientOption, ItemWithEmail } from "@/lib/db/types";

/**
 * Client d'un mail, d'après son expéditeur : d'abord un contact connu
 * (adresse exacte), sinon un client dont un domaine mail correspond
 * (sous-domaines compris). Les adresses et domaines sont stockés en minuscules.
 */
const clientOfSender = sql`coalesce(
  (select cc.client_id
     from client_contacts cc
     join email_messages e on e.from_address = cc.email
    where e.item_id = items.id
    order by cc.created_at
    limit 1),
  (select c.id
     from clients c
     join email_messages e on e.item_id = items.id
    where exists (
      select 1 from unnest(c.email_domains) d
       where split_part(e.from_address, '@', 2) = d
          or split_part(e.from_address, '@', 2) like '%.' || d)
    order by c.created_at
    limit 1)
)`;

/**
 * Rattache à leur client les mails qui n'en ont pas encore. Ne touche jamais
 * un rattachement existant : un choix fait à la main reste en place.
 * Appelé après chaque synchro et quand les domaines ou contacts d'un client changent.
 */
export async function linkItemsToClients(db: Db): Promise<number> {
  const linked = await db
    .update(items)
    .set({ client_id: clientOfSender })
    .where(and(isNull(items.client_id), sql`${clientOfSender} is not null`))
    .returning({ id: items.id });
  return linked.length;
}

/** Clients proposés dans les listes déroulantes (hors archivés). */
export async function getClientOptions(db: Db): Promise<ClientOption[]> {
  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(sql`${clients.status} <> 'archived'`)
    .orderBy(asc(clients.name));
}

/** Client désigné par « @slug » dans la saisie rapide : slug exact, sinon début de slug s'il est unique. */
export async function findClientByRef(db: Db, ref: string): Promise<string | null> {
  const slug = ref.toLowerCase();
  const rows = await db
    .select({ id: clients.id, slug: clients.slug })
    .from(clients)
    .where(sql`${clients.slug} like ${slug.replace(/[%_\\]/g, "\\$&") + "%"}`);
  const exact = rows.find((r) => r.slug === slug);
  if (exact) return exact.id;
  return rows.length === 1 ? rows[0]!.id : null;
}

/** Tout ce qui est rattaché à un client : ce qui est ouvert, puis ce qui a été clos récemment. */
export async function getClientActivity(db: Db, clientId: string) {
  const withEmail = () =>
    db.select({ item: items, email: emailMessages }).from(items).leftJoin(emailMessages, eq(emailMessages.item_id, items.id));
  const flatten = (rows: Awaited<ReturnType<typeof withEmail>>) =>
    rows.map((r): ItemWithEmail => ({ ...r.item, email_messages: r.email }));

  const [open, closed, notes] = await Promise.all([
    withEmail()
      .where(and(eq(items.client_id, clientId), notInArray(items.status, ["done", "archived"])))
      .orderBy(desc(items.priority_score), asc(items.due_at))
      .limit(100),
    withEmail()
      .where(and(eq(items.client_id, clientId), inArray(items.status, ["done", "archived"])))
      .orderBy(desc(items.updated_at))
      .limit(15),
    db.select().from(clientNotes).where(eq(clientNotes.client_id, clientId)).orderBy(desc(clientNotes.created_at)),
  ]);
  return { open: flatten(open), closed: flatten(closed), notes };
}
