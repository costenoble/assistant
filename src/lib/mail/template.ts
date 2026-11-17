/**
 * Gabarit HTML des emails envoyés par Cockpit (invitations, notifications de
 * tâches, lien de connexion). Mise en page en tableaux et styles en ligne :
 * c'est ce que Gmail, Outlook et Apple Mail affichent tous correctement.
 */

export interface TemplateInput {
  subject: string;
  paragraphs: string[];
  /** Message cité (réponse d'un client, commentaire), affiché dans un encadré. */
  quote?: string;
  link?: { url: string; label: string };
  footer?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Expéditeur des emails : le nom de MAIL_FROM s'il en a un (« Atelier <a@x.fr> »),
 * sinon MAIL_FROM_NAME, sinon « Cockpit ».
 */
export function senderFrom(mailFrom: string, fallbackName?: string): { name: string; address: string } {
  const m = mailFrom.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1]!.trim() || fallbackName?.trim() || "Cockpit", address: m[2]!.trim() };
  return { name: fallbackName?.trim() || "Cockpit", address: mailFrom.trim() };
}

const ACCENT = "#2f6bd8";

const paragraph = (p: string) =>
  `<tr><td style="padding:0 0 16px;color:#1f2328;font-size:15px;line-height:24px">${escapeHtml(p).replace(/\n/g, "<br>")}</td></tr>`;

const quoteBlock = (q: string) =>
  `<tr><td style="padding:0 0 18px"><div style="border-left:3px solid #d8dbe0;padding:12px 16px;background:#f6f7f9;border-radius:8px;color:#3d4450;font-size:15px;line-height:24px">${escapeHtml(q).replace(/\n/g, "<br>")}</div></td></tr>`;

export function renderEmailHtml(mail: TemplateInput, brand: string): string {
  const preheader = escapeHtml((mail.paragraphs.find((p, i) => i > 0 || !/^bonjour/i.test(p)) ?? mail.subject).slice(0, 140));
  const button = mail.link
    ? `<tr><td style="padding:8px 0 20px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${ACCENT}" style="border-radius:8px">
    <a href="${escapeHtml(mail.link.url)}" target="_blank" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(mail.link.label)}</a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:0 0 4px;color:#6b7280;font-size:12px;line-height:18px">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><a href="${escapeHtml(mail.link.url)}" style="color:${ACCENT};word-break:break-all">${escapeHtml(mail.link.url)}</a></td></tr>`
    : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(mail.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f3ef">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f3ef"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td style="padding:0 4px 16px;font-size:15px;font-weight:700;color:#1f2328;letter-spacing:-0.01em">
      <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${ACCENT};margin-right:8px;vertical-align:middle"></span>${escapeHtml(brand)}
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e6e6e1;border-radius:14px;padding:28px 28px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${mail.paragraphs.map(paragraph).join("\n        ")}
        ${mail.quote ? quoteBlock(mail.quote) : ""}
        ${button}
      </table>
    </td></tr>
    <tr><td style="padding:16px 4px 0;color:#8a8f98;font-size:12px;line-height:18px">${escapeHtml(mail.footer ?? `Envoyé par ${brand}.`)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
