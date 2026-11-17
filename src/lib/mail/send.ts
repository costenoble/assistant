import "server-only";
import nodemailer from "nodemailer";
import { smtpConfig } from "@/lib/env";
import { renderEmailHtml, senderFrom } from "./template";

function transport() {
  const smtp = smtpConfig();
  if (!smtp) return null;
  return {
    // « Cockpit <adresse> » plutôt que l'adresse seule dans la boîte du destinataire.
    from: senderFrom(smtp.MAIL_FROM ?? smtp.SMTP_USER, smtp.MAIL_FROM_NAME),
    mailer: nodemailer.createTransport({
      host: smtp.SMTP_HOST,
      port: smtp.SMTP_PORT,
      secure: smtp.SMTP_PORT === 465,
      auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS },
    }),
  };
}

/** En-tête posé sur les mails envoyés par l'app : la synchro IMAP les ignore (pas de doublon dans le flux). */
export const NOTIFICATION_HEADER = "X-Cockpit-Notification";

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Paragraphes en texte brut ; le HTML est produit à partir d'eux, échappé. */
  paragraphs: string[];
  /** Message cité, encadré dans le mail (réponse d'un client, commentaire). */
  quote?: string;
  link?: { url: string; label: string };
  /** Petite ligne grise en bas du mail. */
  footer?: string;
  /** Nature de la notification, posée dans l'en-tête NOTIFICATION_HEADER. */
  kind?: string;
}

/**
 * Envoie un email (SMTP Hostinger par défaut).
 * Sans SMTP configuré : en développement le contenu s'affiche dans le terminal ;
 * en production c'est une erreur, pour ne rien perdre en silence.
 */
export async function sendEmail(mail: OutgoingEmail) {
  const t = transport();
  const text = [...mail.paragraphs, ...(mail.quote ? [mail.quote.split("\n").map((l) => `> ${l}`).join("\n")] : []), ...(mail.link ? [`${mail.link.label} : ${mail.link.url}`] : []), ...(mail.footer ? [mail.footer] : [])].join("\n\n");
  if (!t) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP non configuré (SMTP_USER / SMTP_PASS) : impossible d'envoyer l'email.");
    }
    console.log(`\n[email] À ${mail.to} — ${mail.subject}\n${text}\n`);
    return;
  }
  const html = renderEmailHtml(mail, t.from.name);
  await t.mailer.sendMail({
    from: t.from,
    to: mail.to,
    subject: mail.subject,
    text,
    html,
    headers: { [NOTIFICATION_HEADER]: mail.kind ?? "1" },
  });
}

/** Lien de connexion (lien magique). */
export async function sendLoginLink(email: string, url: string) {
  await sendEmail({
    to: email,
    subject: "Votre lien de connexion",
    paragraphs: ["Bonjour,", "Voici votre lien de connexion (valable 15 minutes, utilisable une seule fois)."],
    link: { url, label: "Se connecter" },
    footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    kind: "login",
  });
}
