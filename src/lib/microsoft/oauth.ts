import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { oauthTokens } from "@/lib/db/schema";
import { env, microsoftConfig } from "@/lib/env";

/**
 * OAuth 2.0 « authorization code » délégué vers Microsoft Entra ID.
 * Lecture seule : agenda + mails (pour les mails drapeautés = tâches Outlook).
 */
export const MS_SCOPES = ["offline_access", "User.Read", "Calendars.Read", "Mail.Read"];

export function redirectUri() {
  return `${env().NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`;
}

function authority() {
  const cfg = microsoftConfig();
  if (!cfg) throw new Error("Microsoft 365 non configuré (MS_CLIENT_ID / MS_CLIENT_SECRET).");
  return { cfg, base: `https://login.microsoftonline.com/${cfg.MS_TENANT_ID}/oauth2/v2.0` };
}

export function buildAuthorizeUrl(state: string) {
  const { cfg, base } = authority();
  const url = new URL(`${base}/authorize`);
  url.search = new URLSearchParams({
    client_id: cfg.MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { cfg, base } = authority();
  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.MS_CLIENT_ID,
      client_secret: cfg.MS_CLIENT_SECRET,
      scope: MS_SCOPES.join(" "),
      ...params,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new Error(`Microsoft token : ${json.error ?? res.status} ${json.error_description ?? ""}`.trim());
  }
  return json;
}

export async function exchangeCode(db: Db, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Pas de refresh_token : vérifie le scope offline_access.");

  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json() as Promise<{ mail?: string; userPrincipalName?: string }>);

  await saveTokens(db, t, me.mail ?? me.userPrincipalName ?? null);
}

/** `accountEmail` absent (rafraîchissement) = on garde l'adresse déjà enregistrée. */
async function saveTokens(db: Db, t: TokenResponse, accountEmail?: string | null) {
  const fresh = {
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? null,
    updated_at: new Date(),
    // Microsoft ne renvoie pas toujours un nouveau refresh_token : on garde l'ancien.
    ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
    ...(accountEmail !== undefined ? { account_email: accountEmail } : {}),
  };
  if (t.refresh_token) {
    await db
      .insert(oauthTokens)
      .values({ provider: "microsoft", ...fresh, refresh_token: t.refresh_token })
      .onConflictDoUpdate({ target: oauthTokens.provider, set: fresh });
  } else {
    await db.update(oauthTokens).set(fresh).where(eq(oauthTokens.provider, "microsoft"));
  }
}

/** Jeton d'accès valide (rafraîchi si besoin), ou null si non connecté. */
export async function getAccessToken(db: Db): Promise<string | null> {
  const [data] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, "microsoft"));
  if (!data) return null;
  if (data.expires_at.getTime() > Date.now()) return data.access_token;

  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await saveTokens(db, t);
  return t.access_token;
}

/** Compte Microsoft connecté (sans les jetons), pour l'affichage. */
export async function getMicrosoftAccount(db: Db) {
  const [row] = await db
    .select({ account_email: oauthTokens.account_email, updated_at: oauthTokens.updated_at })
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, "microsoft"));
  return row ?? null;
}

export async function disconnectMicrosoft(db: Db) {
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, "microsoft"));
}
