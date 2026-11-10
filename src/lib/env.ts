import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement validées au premier accès.
 * Les modules optionnels (mails, Microsoft) sont validés séparément pour
 * que l'app démarre même si un connecteur n'est pas encore configuré.
 */
const coreSchema = z.object({
  // URL « pooled » de Neon (ajoutée par l'intégration Vercel).
  DATABASE_URL: z.string().startsWith("postgres"),
  // Signe les sessions : `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32),
  OWNER_EMAIL: z.email(),
  NEXT_PUBLIC_APP_URL: z.url(),
  CRON_SECRET: z.string().min(16),
});

const smtpSchema = z.object({
  SMTP_HOST: z.string().default("smtp.hostinger.com"),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().min(3),
  SMTP_PASS: z.string().min(1),
  MAIL_FROM: z.string().optional(),
});

export const mailAccountSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id en minuscules, chiffres et tirets"),
  label: z.string().optional(),
  host: z.string().default("imap.hostinger.com"),
  port: z.number().int().default(993),
  user: z.string().min(3),
  password: z.string().min(1),
  mailboxes: z.array(z.string()).default(["INBOX"]),
});
export type MailAccount = z.infer<typeof mailAccountSchema>;

const microsoftSchema = z.object({
  MS_CLIENT_ID: z.string().min(1),
  MS_CLIENT_SECRET: z.string().min(1),
  MS_TENANT_ID: z.string().default("organizations"),
});

let cached: z.infer<typeof coreSchema> | undefined;

export function env() {
  cached ??= coreSchema.parse(process.env);
  return cached;
}

export function mailAccounts(): MailAccount[] {
  const raw = process.env.MAIL_ACCOUNTS;
  if (!raw) return [];
  return z.array(mailAccountSchema).parse(JSON.parse(raw));
}

export function mailInitialSyncDays(): number {
  return Number(process.env.MAIL_INITIAL_SYNC_DAYS ?? 14);
}

/** null si Microsoft 365 n'est pas configuré. */
export function microsoftConfig() {
  const parsed = microsoftSchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

/** null si l'envoi d'emails (liens de connexion) n'est pas configuré. */
export function smtpConfig() {
  const parsed = smtpSchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}
