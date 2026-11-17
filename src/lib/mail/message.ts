import { simpleParser, type ParsedMail } from "mailparser";
import type { MailAttachment } from "@/lib/db/types";

/**
 * Contenu complet d'un mail : extraction (fonctions pures, testées) et mise en
 * page pour l'affichage dans une iframe isolée. La récupération IMAP est dans
 * ./message-store.ts.
 */

/** Une image intégrée (cid:) plus lourde n'est pas recopiée dans le HTML. */
const MAX_INLINE_IMAGE = 400 * 1024;
/** Au-delà, on ne garde que le texte : un HTML de plusieurs Mo est presque toujours une newsletter. */
export const MAX_STORED_HTML = 1_500_000;

export interface MailContent {
  text: string | null;
  html: string | null;
  cc: string[];
  attachments: MailAttachment[];
}

export async function parseSource(source: Buffer | string): Promise<ParsedMail> {
  return simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
}

/** Texte, HTML (images intégrées recopiées en data: URI), copies et pièces jointes à télécharger. */
export function extractContent(parsed: ParsedMail): MailContent {
  let html = typeof parsed.html === "string" ? parsed.html : null;
  const inlined = new Set<number>();
  parsed.attachments.forEach((a, i) => {
    if (!html || !a.cid || a.size > MAX_INLINE_IMAGE || !a.contentType.startsWith("image/")) return;
    const ref = new RegExp(`cid:${a.cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
    if (!ref.test(html)) return;
    html = html.replace(ref, `data:${a.contentType};base64,${a.content.toString("base64")}`);
    inlined.add(i);
  });
  if (html && html.length > MAX_STORED_HTML) html = null;
  const ccField = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
  return {
    text: parsed.text?.trim() || null,
    html: html ? stripActiveContent(html) : null,
    cc: ccField.flatMap((g) => g.value.map((v) => v.address?.toLowerCase()).filter((x): x is string => !!x)),
    attachments: parsed.attachments
      .map((a, index) => ({ a, index }))
      .filter(({ a, index }) => !inlined.has(index) && !(a.related && a.cid))
      .map(({ a, index }) => ({
        index,
        filename: a.filename || `piece-jointe-${index + 1}`,
        contentType: a.contentType || "application/octet-stream",
        size: a.size,
      })),
  };
}

/**
 * Retire scripts, gestionnaires d'événements et liens javascript:. Ce n'est pas la
 * protection principale (l'iframe n'autorise pas les scripts) mais une seconde ceinture.
 */
export function stripActiveContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    // Cadres et objets : supprimés avec leur contenu. Formulaires et champs : balises seules (le texte reste).
    .replace(/<(iframe|object|frameset|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(iframe|object|frameset|frame|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*/gi, '$1=$2#');
}

/** Nombre d'images distantes (souvent des pixels de suivi). */
export function countRemoteImages(html: string | null): number {
  if (!html) return 0;
  return (html.match(/<img\b[^>]*\bsrc\s*=\s*["']?https?:/gi) ?? []).length + (html.match(/url\(\s*["']?https?:/gi) ?? []).length;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Texte brut → HTML lisible : liens cliquables, citations (« > ») en gris. */
export function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const quoted = /^\s*>/.test(line);
      const body = escapeHtml(line).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (u) => `<a href="${u}">${u}</a>`);
      return quoted ? `<span class="q">${body}</span>` : body;
    })
    .join("\n");
}

/**
 * Neutralise les ressources distantes (images, fonds, srcset) : le navigateur les
 * télécharge parfois avant d'avoir lu la politique de contenu, il faut donc
 * retirer les adresses elles-mêmes.
 */
export function blockRemoteResources(html: string): string {
  return html
    .replace(/(<img\b[^>]*?)\s(src|srcset)\s*=\s*("https?:[^"]*"|'https?:[^']*'|https?:[^\s>]+)/gi, "$1 data-blocked-$2=$3")
    .replace(/\s(srcset)\s*=\s*("[^"]*https?:[^"]*"|'[^']*https?:[^']*')/gi, " data-blocked-$1=$2")
    .replace(/\s(background|poster)\s*=\s*("https?:[^"]*"|'https?:[^']*'|https?:[^\s>]+)/gi, " data-blocked-$1=$2")
    .replace(/url\(\s*(["']?)https?:[^)]*\)/gi, "none")
    .replace(/@import\s+[^;]+;/gi, "");
}

/**
 * Document complet pour l'attribut srcdoc de l'iframe. La politique de contenu
 * bloque tout chargement extérieur (sauf images si `images`), les liens s'ouvrent
 * dans un nouvel onglet.
 */
export function emailDocument(content: { html: string | null; text: string | null }, opts: { images: boolean }): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${opts.images ? " https: http:" : ""}`;
  const html = content.html && !opts.images ? blockRemoteResources(content.html) : content.html;
  const body = html ?? `<pre class="plain">${textToHtml(content.text ?? "")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">
<style>
html,body{margin:0;padding:0;background:#fff;color:#1f2328}
body{padding:24px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
table{max-width:100%}
a{color:#2f6bd8}
pre.plain{margin:0;white-space:pre-wrap;font:inherit}
.q{color:#6b7280}
blockquote{margin:0 0 0 .5em;padding-left:1em;border-left:3px solid #e5e7eb;color:#4b5563}
</style></head><body>${body}</body></html>`;
}
