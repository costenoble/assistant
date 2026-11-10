import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailAccount } from "@/lib/env";
import type { ItemContext, MailRule } from "@/lib/db/types";
import { ensureSource, markSourceSynced, upsertItems, type IncomingItem } from "@/lib/items/repo";
import { matchMailRules } from "@/lib/priority/score";
import { buildSnippet, isBulkMail, mailExternalId } from "./parse";

/**
 * Synchronisation IMAP incrémentale (webmail Hostinger : imap.hostinger.com:993).
 *
 * - 1re synchro : les N derniers jours (MAIL_INITIAL_SYNC_DAYS).
 * - Ensuite : uniquement les UID > dernier UID vu (curseur dans sync_state).
 * - Si l'UIDVALIDITY change (boîte recréée), on repart de zéro proprement.
 * - À chaque passage, on rafraîchit aussi les flags (\Seen, \Answered) des
 *   200 derniers mails : répondre depuis le webmail ou le téléphone fait
 *   automatiquement passer l'item en « fait » dans Cockpit.
 */

interface Cursor {
  uidValidity: number;
  lastUid: number;
}

const FLAG_REFRESH_WINDOW = 200;
const SOURCE_MAX_BYTES = 64 * 1024;
/** Au-delà, le reste est traité aux passages suivants (cron toutes les 5 min). */
const MAX_FETCH_PER_RUN = 150;

export interface MailSyncReport {
  account: string;
  mailbox: string;
  fetched: number;
  flagsUpdated: number;
  resetCursor: boolean;
}

export async function syncMailAccount(
  db: SupabaseClient,
  ownerId: string,
  account: MailAccount,
  opts: { initialDays: number; defaultContext?: ItemContext },
): Promise<MailSyncReport[]> {
  const source = await ensureSource(db, ownerId, {
    slug: `mail-${account.id}`,
    name: `Mail · ${account.label ?? account.user}`,
    kind: "mail",
    default_context: opts.defaultContext ?? "freelance",
  });

  const { data: rules } = await db.from("mail_rules").select("*").eq("owner_id", ownerId);

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.port === 993,
    auth: { user: account.user, pass: account.password },
    logger: false,
    socketTimeout: 45_000,
  });

  const reports: MailSyncReport[] = [];
  try {
    await client.connect();
    for (const mailbox of account.mailboxes) {
      reports.push(
        await syncMailbox(db, client, {
          ownerId,
          account,
          mailbox,
          source,
          rules: (rules ?? []) as MailRule[],
          initialDays: opts.initialDays,
        }),
      );
    }
    await markSourceSynced(db, source.id, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markSourceSynced(db, source.id, message);
    throw err;
  } finally {
    await client.logout().catch(() => client.close());
  }
  return reports;
}

async function syncMailbox(
  db: SupabaseClient,
  client: ImapFlow,
  ctx: {
    ownerId: string;
    account: MailAccount;
    mailbox: string;
    source: { id: string; default_context: ItemContext };
    rules: MailRule[];
    initialDays: number;
  },
): Promise<MailSyncReport> {
  const cursorKey = `imap:${ctx.account.id}:${ctx.mailbox}`;
  const { data: state } = await db.from("sync_state").select("value").eq("key", cursorKey).maybeSingle();
  const cursor = (state?.value ?? null) as Cursor | null;

  const lock = await client.getMailboxLock(ctx.mailbox, { readOnly: true });
  try {
    const box = client.mailbox;
    if (!box) throw new Error(`Boîte ${ctx.mailbox} introuvable`);
    const uidValidity = Number(box.uidValidity);
    const resetCursor = !cursor || cursor.uidValidity !== uidValidity;

    // 1. Quels UID récupérer ? (plafonnés pour tenir dans le temps d'exécution)
    let uids: number[];
    let maxUid: number;
    if (resetCursor) {
      const since = new Date(Date.now() - ctx.initialDays * 86_400_000);
      const found = ((await client.search({ since }, { uid: true })) || []) as number[];
      uids = found.sort((a, b) => a - b).slice(-MAX_FETCH_PER_RUN); // les plus récents
      // Le curseur part de UIDNEXT - 1, même si la fenêtre initiale est vide :
      // sinon la synchro suivante chercherait « 1:* » et rapatrierait toute la boîte.
      maxUid = Math.max(0, Number(box.uidNext ?? 0) - 1);
    } else {
      const found = ((await client.search({ uid: `${cursor.lastUid + 1}:*` }, { uid: true })) || []) as number[];
      uids = found
        .filter((u) => u > cursor.lastUid) // "n:*" renvoie toujours le dernier mail
        .sort((a, b) => a - b)
        .slice(0, MAX_FETCH_PER_RUN); // les plus anciens d'abord : le curseur avance à chaque passage
      maxUid = cursor.lastUid;
    }

    // 2. Récupération + parsing.
    const incoming: IncomingItem[] = [];
    const emailRows: Omit<EmailRow, "item_id">[] = [];

    if (uids.length) {
      for await (const msg of client.fetch(
        uids,
        { uid: true, envelope: true, flags: true, internalDate: true, source: { maxLength: SOURCE_MAX_BYTES } },
        { uid: true },
      )) {
        maxUid = Math.max(maxUid, msg.uid);
        const parsed = await toEmail(msg, ctx.account.id, ctx.mailbox, uidValidity);
        const matched = matchMailRules(ctx.rules, parsed.row.from_address, parsed.row.subject);
        const context = matched.find((r) => r.context)?.context ?? undefined;
        // Un mail « de masse » n'est archivé d'office que si aucune de tes règles ne le concerne
        // (un client VIP qui écrit depuis un CRM avec List-Unsubscribe doit rester visible).
        const wanted = matched.some((r) => r.action === "vip" || r.context || r.priority_boost > 0);
        const autoArchive = parsed.row.is_answered || (parsed.row.is_bulk && !wanted);

        incoming.push({
          external_id: parsed.externalId,
          kind: "email",
          title: parsed.row.subject || "(sans objet)",
          body: parsed.row.snippet,
          context,
          initial_status: autoArchive ? "archived" : "inbox",
          metadata: { account: ctx.account.id, from: parsed.row.from_name ?? parsed.row.from_address },
        });
        emailRows.push(parsed.row);
      }
    }

    // 3. Écriture des items puis des détails mail.
    const ids = await upsertItems(db, ctx.ownerId, ctx.source, incoming);
    const byItem = new Map<string, EmailRow>();
    emailRows.forEach((row, i) => {
      const itemId = ids.get(incoming[i]!.external_id);
      if (itemId) byItem.set(itemId, { ...row, item_id: itemId });
    });
    const rows = [...byItem.values()];
    if (rows.length) {
      const { error } = await db.from("email_messages").upsert(rows, { onConflict: "item_id" });
      if (error) throw new Error(`email_messages : ${error.message}`);
    }

    // 4. Rafraîchissement des flags récents (réponses envoyées ailleurs).
    const flagsUpdated = await refreshRecentFlags(db, client, ctx.account.id, ctx.mailbox, uidValidity);

    // 5. Curseur.
    await db.from("sync_state").upsert({
      key: cursorKey,
      value: { uidValidity, lastUid: maxUid } satisfies Cursor,
      updated_at: new Date().toISOString(),
    });

    return { account: ctx.account.id, mailbox: ctx.mailbox, fetched: incoming.length, flagsUpdated, resetCursor };
  } finally {
    lock.release();
  }
}

interface EmailRow {
  item_id: string;
  account_id: string;
  mailbox: string;
  uid: number;
  uid_validity: number;
  message_id: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  is_seen: boolean;
  is_answered: boolean;
  is_bulk: boolean;
}

async function toEmail(msg: FetchMessageObject, accountId: string, mailbox: string, uidValidity: number) {
  const env = msg.envelope;
  const from = env?.from?.[0];
  const fromAddress = from?.address?.toLowerCase() ?? null;
  const parsed = msg.source ? await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true }) : null;
  const flags = msg.flags ?? new Set<string>();
  const received = msg.internalDate ? new Date(msg.internalDate) : (env?.date ?? new Date());

  const row: Omit<EmailRow, "item_id"> = {
    account_id: accountId,
    mailbox,
    uid: msg.uid,
    uid_validity: uidValidity,
    message_id: env?.messageId ?? null,
    from_address: fromAddress,
    from_name: from?.name || null,
    to_addresses: (env?.to ?? []).map((a) => a.address?.toLowerCase()).filter((a): a is string => !!a),
    subject: env?.subject ?? null,
    snippet: buildSnippet(parsed?.text),
    received_at: new Date(received).toISOString(),
    is_seen: flags.has("\\Seen"),
    is_answered: flags.has("\\Answered"),
    is_bulk: isBulkMail(parsed?.headers ?? null, fromAddress),
  };
  return { row, externalId: mailExternalId(accountId, mailbox, uidValidity, msg.uid, row.message_id) };
}

async function refreshRecentFlags(
  db: SupabaseClient,
  client: ImapFlow,
  accountId: string,
  mailbox: string,
  uidValidity: number,
): Promise<number> {
  const { data: recent } = await db
    .from("email_messages")
    .select("item_id, uid, is_seen, is_answered")
    .eq("account_id", accountId)
    .eq("mailbox", mailbox)
    .eq("uid_validity", uidValidity)
    .order("uid", { ascending: false })
    .limit(FLAG_REFRESH_WINDOW);
  if (!recent?.length) return 0;

  const byUid = new Map(recent.map((r) => [Number(r.uid), r]));
  let updated = 0;
  for await (const msg of client.fetch([...byUid.keys()], { uid: true, flags: true }, { uid: true })) {
    const row = byUid.get(msg.uid);
    if (!row) continue;
    const isSeen = msg.flags?.has("\\Seen") ?? false;
    const isAnswered = msg.flags?.has("\\Answered") ?? false;
    if (isSeen === row.is_seen && isAnswered === row.is_answered) continue;

    await db.from("email_messages").update({ is_seen: isSeen, is_answered: isAnswered }).eq("item_id", row.item_id);
    if (isAnswered && !row.is_answered) {
      // Répondu depuis le webmail → plus rien à faire, sauf si l'utilisateur l'a converti en tâche.
      await db.from("items").update({ status: "done" }).eq("id", row.item_id).eq("kind", "email").eq("status", "inbox");
    }
    updated++;
  }
  return updated;
}
