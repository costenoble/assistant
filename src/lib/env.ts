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
  /** Nom affiché comme expéditeur (« Cockpit » par défaut) quand MAIL_FROM n'en donne pas. */
  MAIL_FROM_NAME: z.string().optional(),
});

export const mailAccountSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id en minuscules, chiffres et tirets"),
  label: z.string().optional(),
  host: z.string().default("imap.hostinger.com"),
  port: z.number().int().default(993),
  user: z.string().min(3),
  password: z.string().min(1),
  mailboxes: z.array(z.string()).default(["INBOX"]),
  /** Envoi des réponses : par défaut le serveur SMTP du même hébergeur (imap.x → smtp.x), port 465. */
  smtp_host: z.string().optional(),
  smtp_port: z.number().int().default(465),
  /** Nom affiché quand tu réponds depuis Cockpit (ex. « Ryan Costenoble »). */
  from_name: z.string().optional(),
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

/**
 * Clé de l'API Claude, ou null si l'IA n'est pas configurée (l'app marche sans).
 * ANTHROPIC_API_KEY (nom standard) ou API_KEY (nom utilisé dans .env.local).
 */
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || process.env.API_KEY || null;
}

/**
 * Clés VAPID des notifications sur téléphone (`npx web-push generate-vapid-keys`).
 * Facultatives : sans elles, la cloche marche mais rien n'est envoyé aux appareils.
 */
export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // Identifiant d'expéditeur transmis aux services de notification (Apple, Google) : l'adresse de l'app, pas un email perso.
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || "https://localhost" };
}
