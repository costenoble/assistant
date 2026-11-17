import type Mail from "nodemailer/lib/mailer";
import type { emailMessages } from "@/lib/db/schema";
import type { MailAccount } from "@/lib/env";

/** Fabrication du message de réponse (pur, testé) : en-têtes de fil, sujet « Re: », citation. */

export interface ReplyInput {
  body: string;
  subject?: string;
  cc?: string[];
}

type EmailRow = typeof emailMessages.$inferSelect;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function replySubject(subject: string | null): string {
  const s = (subject ?? "").trim();
  return /^(re|tr|fwd?)\s*:/i.test(s) ? s.replace(/^(tr|fwd?)\s*:/i, "Re:") : `Re: ${s || "(sans objet)"}`;
}

export function buildReplyOptions(row: EmailRow, account: Pick<MailAccount, "user" | "from_name">, input: ReplyInput): Mail.Options {
  const when = row.received_at.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
  const who = row.from_name ? `${row.from_name} <${row.from_address}>` : (row.from_address ?? "");
  const original = (row.body_text ?? row.snippet ?? "").trim();
  const header = `Le ${when}, ${who} a écrit :`;
  const text = [input.body.trim(), "", header, ...original.split("\n").map((l) => `> ${l}`)].join("\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55">${escapeHtml(input.body.trim()).replace(/\n/g, "<br>")}</div>
<br><div style="color:#555">${escapeHtml(header)}</div>
<blockquote style="margin:4px 0 0 4px;padding-left:12px;border-left:3px solid #ddd;color:#555">${escapeHtml(original).replace(/\n/g, "<br>")}</blockquote>`;
  const references = row.message_id ? [row.message_id] : undefined;
  return {
    from: account.from_name ? { name: account.from_name, address: account.user } : account.user,
    to: row.from_name ? { name: row.from_name, address: row.from_address ?? "" } : (row.from_address ?? ""),
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject?.trim() || replySubject(row.subject),
    inReplyTo: row.message_id ?? undefined,
    references,
    text,
    html,
    date: new Date(),
  };
}
