import { formatSize, isInlineImage } from "@/lib/files/rules";
import { IconPaperclip } from "../icons";

export interface ShownAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
}

/** Pièces jointes : vignettes pour les images (clic = taille réelle), cartes à télécharger pour le reste. */
export function AttachmentList({ items, tone = "default" }: { items: ShownAttachment[]; tone?: "default" | "bubble" }) {
  if (!items.length) return null;
  const images = items.filter((a) => isInlineImage(a.content_type));
  const files = items.filter((a) => !isInlineImage(a.content_type));
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((a) => (
            <li key={a.id}>
              <a href={`/fichiers/${a.id}`} target="_blank" rel="noreferrer" title={a.filename} className="block overflow-hidden rounded-lg border border-border bg-surface-2 transition hover:border-border-strong">
                {/* eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par Cockpit, pas par l'optimiseur d'images */}
                <img src={`/fichiers/${a.id}`} alt={a.filename} loading="lazy" className="h-28 w-auto max-w-[220px] object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((a) => (
            <li key={a.id}>
              <a
                href={`/fichiers/${a.id}?telecharger`}
                className={`flex max-w-[280px] items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:border-border-strong ${tone === "bubble" ? "border-border/70 bg-surface/60" : "border-border bg-surface"}`}
              >
                <IconPaperclip className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 text-xs text-muted">{formatSize(a.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
