/**
 * Adresse d'une photo de profil. Le paramètre `v` change avec la photo : le
 * navigateur peut la garder en cache sans jamais afficher une ancienne photo.
 * `who` = id du contact, ou "moi" pour toi.
 */
export function avatarUrl(who: string, key: string | null | undefined): string | null {
  if (!key) return null;
  const v = key.match(/([0-9a-f]{8})-[0-9a-f-]{27}/)?.[1] ?? key.length.toString(36);
  return `/avatars/${who}?v=${v}`;
}
