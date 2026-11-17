import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { emailMessages, items } from "@/lib/db/schema";
import { mailAccounts, type MailAccount } from "@/lib/env";
import { buildReplyOptions, type ReplyInput } from "./reply-message";

export class MailSendError extends Error {}

type EmailRow = typeof emailMessages.$inferSelect;

/** Dossier « Envoyés » : par attribut \Sent, sinon par nom. */
async function sentFolder(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  return (
    boxes.find((b) => b.specialUse === "\\Sent")?.path ??
    boxes.find((b) => /(^|[./])(sent|envoy[ée]s?|sent items|sent messages)$/i.test(b.path))?.path ??
    null
  );
}

/**
 * Envoie ta réponse depuis le compte qui a reçu le mail, la range dans
 * « Envoyés », marque le mail d'origine comme répondu et l'item comme traité.
 * Renvoie les avertissements non bloquants (copie dans Envoyés impossible…).
 */
export async function sendMailReply(db: Db, row: EmailRow, input: ReplyInput): Promise<{ warnings: string[] }> {
  const account: MailAccount | undefined = mailAccounts().find((a) => a.id === row.account_id);
  if (!account) throw new MailSendError(`Le compte mail « ${row.account_id} » n'est plus configuré.`);
  if (!row.from_address) throw new MailSendError("Ce mail n'a pas d'adresse d'expéditeur : impossible d'y répondre.");

  const options = buildReplyOptions(row, account, input);
  const raw = await new MailComposer(options).compile().build();

  const smtpHost = account.smtp_host ?? account.host.replace(/^imap\./, "smtp.");
  try {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.user, pass: account.password },
    });
    await transport.sendMail({ envelope: { from: account.user, to: [row.from_address, ...(input.cc ?? [])] }, raw });
  } catch (err) {
    throw new MailSendError(`Envoi impossible (${smtpHost}) : ${err instanceof Error ? err.message : String(err)}`);
  }

  // Le mail est parti : la suite ne doit jamais faire croire à un échec d'envoi.
  const warnings: string[] = [];
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
    const sent = await sentFolder(client);
    if (sent) await client.append(sent, raw, ["\\Seen"]);
    else warnings.push("Dossier « Envoyés » introuvable : la réponse n'y apparaîtra pas dans ton webmail.");
    const lock = await client.getMailboxLock(row.mailbox);
    try {
      if (Number(client.mailbox && client.mailbox.uidValidity) === row.uid_validity) {
        await client.messageFlagsAdd(String(row.uid), ["\\Answered", "\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    warnings.push(`Réponse envoyée, mais la copie dans « Envoyés » a échoué : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await client.logout().catch(() => client.close());
  }

  await db.update(emailMessages).set({ is_answered: true, is_seen: true }).where(eq(emailMessages.item_id, row.item_id));
  await db.update(items).set({ status: "done" }).where(eq(items.id, row.item_id));
  return { warnings };
}
