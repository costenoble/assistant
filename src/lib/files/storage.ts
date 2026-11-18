import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

/**
 * Stockage des fichiers : Blob Vercel privé quand BLOB_READ_WRITE_TOKEN est là
 * (production), sinon un dossier local `.data/uploads` (développement, tests).
 */

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export class StorageNotConfigured extends Error {}

function guard() {
  if (!useBlob() && process.env.VERCEL) {
    throw new StorageNotConfigured("Le stockage des fichiers n'est pas configuré (Blob Vercel non relié au projet).");
  }
}

const localPath = (key: string) => {
  const p = path.join(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR + path.sep)) throw new Error("Chemin de fichier invalide");
  return p;
};

export async function putFile(key: string, data: Buffer, contentType: string) {
  guard();
  if (useBlob()) {
    await put(key, data, { access: "private", contentType, addRandomSuffix: false });
    return;
  }
  await mkdir(path.dirname(localPath(key)), { recursive: true });
  await writeFile(localPath(key), data);
}

/** Contenu d'un fichier ; null s'il n'existe plus. */
export async function getFile(key: string): Promise<ReadableStream<Uint8Array> | Buffer | null> {
  guard();
  if (useBlob()) {
    const r = await get(key, { access: "private" });
    return r?.stream ?? null;
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}

export async function deleteFile(key: string) {
  guard();
  if (useBlob()) await del(key);
  else await rm(localPath(key), { force: true });
}
