import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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

export async function exchangeCode(db: SupabaseClient, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Pas de refresh_token : vérifie le scope offline_access.");

  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json() as Promise<{ mail?: string; userPrincipalName?: string }>);

  await saveTokens(db, t, me.mail ?? me.userPrincipalName ?? null);
}

async function saveTokens(db: SupabaseClient, t: TokenResponse, accountEmail?: string | null) {
  const row: Record<string, unknown> = {
    provider: "microsoft",
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    scope: t.scope ?? null,
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token) row.refresh_token = t.refresh_token;
  if (accountEmail !== undefined) row.account_email = accountEmail;
  const { error } = await db.from("oauth_tokens").upsert(row, { onConflict: "provider" });
  if (error) throw new Error(`oauth_tokens : ${error.message}`);
}

/** Jeton d'accès valide (rafraîchi si besoin), ou null si non connecté. */
export async function getAccessToken(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "microsoft")
    .maybeSingle();
  if (!data) return null;
  if (Date.parse(data.expires_at) > Date.now()) return data.access_token;

  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  await saveTokens(db, t);
  return t.access_token;
}

export async function disconnectMicrosoft(db: SupabaseClient) {
  await db.from("oauth_tokens").delete().eq("provider", "microsoft");
}
