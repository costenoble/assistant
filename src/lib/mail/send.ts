import "server-only";
import nodemailer from "nodemailer";
import { smtpConfig } from "@/lib/env";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Envoie le lien de connexion (SMTP Hostinger par défaut).
 * Sans SMTP configuré : en développement le lien s'affiche dans le terminal ;
 * en production c'est une erreur, pour ne pas perdre un lien en silence.
 */
export async function sendLoginLink(email: string, url: string) {
  const smtp = smtpConfig();
  if (!smtp) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP non configuré (SMTP_USER / SMTP_PASS) : impossible d'envoyer le lien de connexion.");
    }
    console.log(`\n[login] Lien de connexion pour ${email} :\n${url}\n`);
    return;
  }

  const transport = nodemailer.createTransport({
    host: smtp.SMTP_HOST,
    port: smtp.SMTP_PORT,
    secure: smtp.SMTP_PORT === 465,
    auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASS },
  });
  const link = escapeHtml(url);
  await transport.sendMail({
    from: smtp.MAIL_FROM ?? smtp.SMTP_USER,
    to: email,
    subject: "Votre lien de connexion",
    text: `Bonjour,\n\nVoici votre lien de connexion (valable 15 minutes, utilisable une seule fois) :\n\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `<p>Bonjour,</p><p>Voici votre lien de connexion (valable 15 minutes, utilisable une seule fois) :</p><p><a href="${link}">Se connecter</a></p><p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${link}</p><p style="color:#666;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
  });
}
