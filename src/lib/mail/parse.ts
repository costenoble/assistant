/**
 * Fonctions pures d'analyse des mails (testables sans serveur IMAP).
 */

// Pas de info@ / hello@ / contact@ : beaucoup de petites entreprises (donc de clients) écrivent depuis ces adresses.
const BULK_SENDER = /^(no-?reply|do-?not-?reply|ne-?pas-?repondre|notifications?|newsletters?|news|mailer-daemon|marketing)@/i;

export interface HeaderBag {
  get(name: string): unknown;
  has(name: string): boolean;
}

/** Newsletter, notification automatique ou mail de masse ? */
export function isBulkMail(headers: HeaderBag | null | undefined, fromAddress: string | null | undefined): boolean {
  if (fromAddress && BULK_SENDER.test(fromAddress)) return true;
  if (!headers) return false;
  if (headers.has("x-cockpit-notification")) return true; // envoyé par l'app elle-même
  if (headers.has("list-unsubscribe") || headers.has("list-id")) return true;
  const precedence = String(headers.get("precedence") ?? "").toLowerCase();
  if (["bulk", "list", "junk"].includes(precedence)) return true;
  const autoSubmitted = String(headers.get("auto-submitted") ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  return false;
}

/** Extrait lisible : texte brut sans citations ni signatures, 280 caractères max. */
export function buildSnippet(text: string | null | undefined, max = 280): string | null {
  if (!text) return null;
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith(">")) continue;
    if (/^(--|__)\s*$/.test(l)) break; // signature
    if (/^(le .+ a écrit|on .+ wrote)\s*:?$/i.test(l)) break; // début de citation
    if (l) kept.push(l);
  }
  const joined = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return null;
  return joined.length > max ? `${joined.slice(0, max - 1).trimEnd()}…` : joined;
}

/** external_id stable d'un mail : Message-ID si dispo, sinon coordonnées IMAP. */
export function mailExternalId(
  accountId: string,
  mailbox: string,
  uidValidity: number,
  uid: number,
  messageId?: string | null,
): string {
  return messageId ? `msgid:${messageId}` : `imap:${accountId}:${mailbox}:${uidValidity}:${uid}`;
}
