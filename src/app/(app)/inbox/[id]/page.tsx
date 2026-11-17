import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getClientOptions } from "@/lib/clients/link";
import { getMail } from "@/lib/mail/queries";
import { loadMessageBody, MailFetchError } from "@/lib/mail/message-store";
import { countRemoteImages, emailDocument } from "@/lib/mail/message";
import { formatDay, formatTime } from "@/lib/time/paris";
import { Avatar } from "@/components/workspace/bits";
import { ClientPicker } from "@/components/client-picker";
import { ItemActions } from "@/components/item-actions";
import { IconPaperclip, IconReply } from "@/components/icons";
import { MailFrame } from "./frame";

export const dynamic = "force-dynamic";

const size = (n: number) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

export default async function MailPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const mail = await getMail(db, parsed.data);
  if (!mail) notFound();
  const { item } = mail;
  let email = mail.email;
  let error: string | null = null;
  try {
    email = await loadMessageBody(db, email);
  } catch (err) {
    if (!(err instanceof MailFetchError)) throw err;
    error = err.message;
  }
  const clients = await getClientOptions(db);
  const sender = email.from_name ?? email.from_address ?? "Expéditeur inconnu";
  const subject = email.subject || item.title || "(sans objet)";
  // Contenu complet si on l'a, sinon l'aperçu enregistré à la synchro.
  const content = { html: email.body_html, text: email.body_text ?? email.snippet };
  const reply = email.from_address
    ? `mailto:${email.from_address}?subject=${encodeURIComponent(/^re\s*:/i.test(subject) ? subject : `Re: ${subject}`)}`
    : null;

  return (
    <article className="max-w-4xl space-y-5">
      <Link href="/inbox" className="text-sm text-muted hover:text-text">← Mails</Link>
      <h1 className="page-title [overflow-wrap:anywhere]">{subject}</h1>

      <header className="card flex flex-wrap items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={sender} size="size-10" />
          <div className="min-w-0 space-y-0.5 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{sender}</span>
              {email.from_name && email.from_address && <span className="truncate text-muted">{email.from_address}</span>}
            </p>
            <p className="text-muted [overflow-wrap:anywhere]">
              À {email.to_addresses.join(", ") || "—"}
              {email.cc_addresses.length > 0 && <> · Cc {email.cc_addresses.join(", ")}</>}
            </p>
            <p className="text-muted">
              {formatDay(email.received_at)} à {formatTime(email.received_at)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
              <ClientPicker itemId={item.id} clientId={item.client_id} clients={clients} />
              {item.priority_reasons.slice(0, 3).map((r) => <span key={r} className="chip">{r}</span>)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reply && (
            <a href={reply} className="btn">
              <IconReply />
              Répondre
            </a>
          )}
          <ItemActions id={item.id} kind={item.kind} status={item.status} alwaysVisible />
        </div>
      </header>

      {error && (
        <p className="rounded-lg border border-high/40 bg-high/10 px-4 py-3 text-sm" role="alert">
          {error} {content.text ? "Voici l'aperçu enregistré." : ""}
        </p>
      )}

      {(content.html || content.text) && (
        <MailFrame
          blocked={emailDocument(content, { images: false })}
          withImages={emailDocument(content, { images: true })}
          remoteImages={countRemoteImages(content.html)}
        />
      )}

      {email.attachments.length > 0 && (
        <section aria-labelledby="pj-h" className="space-y-2">
          <h2 id="pj-h" className="section-title">Pièces jointes ({email.attachments.length})</h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
            {email.attachments.map((a) => (
              <li key={a.index}>
                <a href={`/inbox/${item.id}/pj/${a.index}`} className="card flex items-center gap-3 p-3 text-sm transition hover:border-border-strong">
                  <IconPaperclip className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.filename}</span>
                  <span className="shrink-0 text-xs text-muted">{size(a.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
