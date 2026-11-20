import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, syncState } from "@/lib/db/schema";
import { deleteFile, putFile } from "@/lib/files/storage";

/**
 * Profils : ceux des membres (nom, fonction, téléphone, photo, emails) et le
 * tien (nom et photo affichés côté membre à la place de « Notre équipe »).
 * Un membre présent dans plusieurs espaces a une fiche par espace : son profil
 * est appliqué à toutes ses fiches (même adresse email).
 */

const OWNER_KEY = "owner:profile";
export interface OwnerProfile {
  name: string | null;
  avatar_key: string | null;
}

export async function getOwnerProfile(db: Db): Promise<OwnerProfile> {
  const [row] = await db.select({ value: syncState.value }).from(syncState).where(eq(syncState.key, OWNER_KEY));
  const v = (row?.value ?? {}) as Partial<OwnerProfile>;
  return { name: v.name?.trim() || null, avatar_key: v.avatar_key ?? null };
}

async function saveOwnerProfile(db: Db, value: OwnerProfile) {
  await db.insert(syncState).values({ key: OWNER_KEY, value }).onConflictDoUpdate({ target: syncState.key, set: { value, updated_at: new Date() } });
}

export async function setOwnerName(db: Db, name: string) {
  await saveOwnerProfile(db, { ...(await getOwnerProfile(db)), name: name.trim().slice(0, 80) || null });
}

export interface MemberProfileInput {
  full_name: string;
  job_title: string | null;
  phone: string | null;
  notify_email: boolean;
}

/** Met à jour toutes les fiches de cette personne (une par espace). */
export async function updateMemberProfile(db: Db, email: string, input: MemberProfileInput) {
  await db
    .update(clientContacts)
    .set({
      full_name: input.full_name.trim().slice(0, 120),
      job_title: input.job_title?.trim().slice(0, 120) || null,
      phone: input.phone?.trim().slice(0, 40) || null,
      notify_email: input.notify_email,
    })
    .where(eq(clientContacts.email, email.trim().toLowerCase()));
}

export type AvatarOwner = { kind: "owner" } | { kind: "member"; email: string };

/** Enregistre une nouvelle photo (déjà recadrée et réduite par le navigateur) et retire l'ancienne. */
export async function setAvatar(db: Db, who: AvatarOwner, data: Buffer | null, contentType = "image/webp") {
  const old =
    who.kind === "owner"
      ? (await getOwnerProfile(db)).avatar_key
      : ((await db.select({ k: clientContacts.avatar_key }).from(clientContacts).where(eq(clientContacts.email, who.email)).limit(1))[0]?.k ?? null);
  let key: string | null = null;
  if (data) {
    key = `avatars/${who.kind === "owner" ? "moi" : "membre"}-${randomUUID()}.${contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp"}`;
    await putFile(key, data, contentType);
  }
  if (who.kind === "owner") await saveOwnerProfile(db, { ...(await getOwnerProfile(db)), avatar_key: key });
  else await db.update(clientContacts).set({ avatar_key: key }).where(eq(clientContacts.email, who.email));
  if (old && old !== key) await deleteFile(old).catch(() => {});
  return key;
}

/**
 * Chemin de la photo d'un contact, si la personne qui regarde y a droit :
 * toi (toutes), un membre (les membres de ses espaces et lui-même).
 */
export async function avatarKeyFor(db: Db, viewer: { kind: "owner" } | { kind: "member"; clientIds: string[] }, contactId: string) {
  const [c] = await db
    .select({ key: clientContacts.avatar_key })
    .from(clientContacts)
    .where(and(eq(clientContacts.id, contactId), viewer.kind === "member" ? inArray(clientContacts.client_id, viewer.clientIds.length ? viewer.clientIds : ["00000000-0000-0000-0000-000000000000"]) : undefined));
  return c?.key ?? null;
}
