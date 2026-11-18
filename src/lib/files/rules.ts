/**
 * Types et tailles acceptés pour les pièces jointes (partagé client / serveur).
 * Pas de HTML ni de SVG : ils pourraient exécuter du code s'ils étaient ouverts.
 */

/** Limite d'une requête sur Vercel : 4,5 Mo ; on garde une marge. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 8;

export const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/** Images affichées en vignette dans le fil (les autres fichiers se téléchargent). */
export const isInlineImage = (contentType: string) => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(contentType);

export function checkFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.size) return `« ${file.name} » est vide.`;
  if (file.size > MAX_FILE_BYTES) return `« ${file.name} » dépasse 4 Mo.`;
  if (!ALLOWED_TYPES[file.type]) return `« ${file.name} » : type de fichier non accepté (images, PDF, documents Office, CSV, ZIP, vidéos).`;
  return null;
}

/** Nom propre pour le stockage et le téléchargement (sans chemin ni caractères gênants). */
export function safeFilename(name: string, contentType: string) {
  const base = name.split(/[\\/]/).pop()!.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/^\.+/, "").trim().slice(0, 120) || "fichier";
  const ext = ALLOWED_TYPES[contentType];
  return ext && !base.toLowerCase().endsWith(`.${ext}`) && !(ext === "jpg" && /\.jpe?g$/i.test(base)) ? `${base}.${ext}` : base;
}

export const formatSize = (n: number) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);

/** Identifiants de pièces jointes envoyés par un formulaire (champ caché « attachment_ids »). */
export function attachmentIdsFrom(formData: FormData, field = "attachment_ids"): string[] {
  const raw = String(formData.get(field) ?? "");
  return raw.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX_FILES_PER_MESSAGE);
}
