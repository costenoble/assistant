import { createHash, randomBytes } from "node:crypto";

/** Clé d'API SaaS : « ck_<slug>_<43 caractères aléatoires> ». Seul le hash est stocké. */
export function generateApiKey(slug: string) {
  const key = `ck_${slug}_${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), hint: key.slice(-4) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}
