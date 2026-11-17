import "server-only";
import { ImapFlow } from "imapflow";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailMessages } from "@/lib/db/schema";
import { mailAccounts, type MailAccount } from "@/lib/env";
import { extractContent, parseSource } from "./message";

/** Un message plus lourd n'est pas téléchargé (pièces jointes énormes). */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export class MailFetchError extends Error {}

type EmailRow = typeof emailMessages.$inferSelect;

/** Ouvre la boîte en lecture seule : lire un mail dans Cockpit ne le marque pas comme lu dans le webmail. */
async function withMessageSource<T>(row: EmailRow, fn: (source: Buffer) => Promise<T>): Promise<T> {
  const account: MailAccount | undefined = mailAccounts().find((a) => a.id === row.account_id);
  if (!account) throw new MailFetchError(`Le compte mail « ${row.account_id} » n'est plus configuré.`);
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.port === 993,
    auth: { user: account.user, pass: account.password },
    logger: false,
    socketTimeout: 30_000,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(row.mailbox, { readOnly: true });
    try {
      if (Number(client.mailbox && client.mailbox.uidValidity) !== row.uid_validity) {
        throw new MailFetchError("La boîte mail a été réorganisée : ce message n'est plus accessible à cet endroit.");
      }
      const msg = await client.fetchOne(String(row.uid), { source: { maxLength: MAX_SOURCE_BYTES }, size: true }, { uid: true });
      if (!msg || !msg.source) throw new MailFetchError("Message introuvable sur le serveur (supprimé ou déplacé ?).");
      if ((msg.size ?? 0) > MAX_SOURCE_BYTES) throw new MailFetchError("Message trop lourd pour être affiché ici : ouvre-le dans ton webmail.");
      return await fn(msg.source);
    } finally {
      lock.release();
    }
  } catch (err) {
    if (err instanceof MailFetchError) throw err;
    throw new MailFetchError(`Connexion au serveur mail impossible : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Contenu complet d'un mail : en base s'il a déjà été ouvert, sinon récupéré sur le serveur et gardé. */
export async function loadMessageBody(db: Db, row: EmailRow): Promise<EmailRow> {
  if (row.body_fetched_at) return row;
  const content = await withMessageSource(row, async (source) => extractContent(await parseSource(source)));
  const [updated] = await db
    .update(emailMessages)
    .set({
      body_text: content.text,
      body_html: content.html,
      cc_addresses: content.cc,
      attachments: content.attachments,
      body_fetched_at: new Date(),
    })
    .where(eq(emailMessages.item_id, row.item_id))
    .returning();
  return updated ?? row;
}

/** Une pièce jointe, téléchargée à la demande (jamais stockée dans Cockpit). */
export async function fetchAttachment(row: EmailRow, index: number) {
  return withMessageSource(row, async (source) => {
    const parsed = await parseSource(source);
    const a = parsed.attachments[index];
    if (!a) throw new MailFetchError("Pièce jointe introuvable.");
    return { filename: a.filename || `piece-jointe-${index + 1}`, contentType: a.contentType || "application/octet-stream", content: a.content };
  });
}
