import "server-only";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { getDb, type Db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendLoginLink } from "@/lib/mail/send";
import { canSignIn } from "./access";

export interface AuthConfig {
  baseURL: string;
  secret: string;
  ownerEmail: string;
  sendLink: (email: string, url: string) => Promise<void>;
  plugins?: BetterAuthPlugin[];
}

/**
 * Connexion par lien magique uniquement (pas de mot de passe).
 * Un compte n'est créé que pour l'admin ou un contact avec accès portail :
 * la vérification est refaite à la création, même si un lien a déjà été émis.
 */
export function createAuth(db: Db, cfg: AuthConfig) {
  return betterAuth({
    baseURL: cfg.baseURL,
    secret: cfg.secret,
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (!(await canSignIn(db, newUser.email, cfg.ownerEmail))) return false;
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: ({ email, url }) => cfg.sendLink(email, url),
      }),
      ...(cfg.plugins ?? []),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth(getDb(), {
    baseURL: env().NEXT_PUBLIC_APP_URL,
    secret: env().BETTER_AUTH_SECRET,
    ownerEmail: env().OWNER_EMAIL,
    sendLink: sendLoginLink,
    plugins: [nextCookies()], // doit rester le dernier plugin
  });
  return auth;
}
