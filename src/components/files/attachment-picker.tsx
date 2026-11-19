"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ALLOWED_TYPES, MAX_FILES_PER_MESSAGE, checkFile, formatSize, isInlineImage } from "@/lib/files/rules";
import { IconImage, IconPaperclip } from "../icons";
import { Annotator } from "./annotator";
import { compressImage } from "./compress";

type Item = {
  key: string;
  file: File;
  preview: string | null;
  status: "uploading" | "done" | "error";
  id?: string;
  error?: string;
};

/**
 * Pièces jointes d'un formulaire : bouton « Joindre », glisser-déposer et
 * collage (Cmd/Ctrl + V) sur tout le formulaire, annotation des images.
 * Chaque fichier est envoyé tout de suite ; les identifiants partent avec le
 * formulaire dans le champ caché `name`. La liste se vide au « reset » du formulaire.
 */
export function AttachmentPicker({
  target,
  name = "attachment_ids",
  compact = false,
}: {
  target: { ticketId: string } | { workspaceId: string };
  name?: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [annotating, setAnnotating] = useState<Item | null>(null);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (original: File, replaceKey?: string) => {
      const key = replaceKey ?? `${Date.now()}-${Math.random()}`;
      // Images réduites avant l'envoi (stockage et chargement plus légers).
      const file = await compressImage(original);
      const problem = checkFile(file);
      const preview = isInlineImage(file.type) ? URL.createObjectURL(file) : null;
      const item: Item = { key, file, preview, status: problem ? "error" : "uploading", error: problem ?? undefined };
      setItems((xs) => (replaceKey ? xs.map((x) => (x.key === replaceKey ? item : x)) : [...xs, item].slice(-MAX_FILES_PER_MESSAGE)));
      if (problem) return;
      const fd = new FormData();
      fd.set("file", file);
      if ("ticketId" in target) fd.set("ticket_id", target.ticketId);
      else fd.set("workspace_id", target.workspaceId);
      try {
        const res = await fetch("/api/fichiers", { method: "POST", body: fd });
        const data = (await res.json()) as { id?: string; error?: string };
        setItems((xs) => xs.map((x) => (x.key === key ? (res.ok && data.id ? { ...x, status: "done", id: data.id } : { ...x, status: "error", error: data.error ?? "Envoi impossible." }) : x)));
      } catch {
        setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status: "error", error: "Connexion perdue." } : x)));
      }
    },
    [target],
  );

  const remove = (item: Item) => {
    setItems((xs) => xs.filter((x) => x.key !== item.key));
    if (item.id) void fetch(`/api/fichiers?id=${item.id}`, { method: "DELETE" });
  };

  // Collage et glisser-déposer sur tout le formulaire ; liste vidée quand le formulaire est réinitialisé.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f) => {
        // Une capture collée n'a pas de nom parlant.
        const named = f.name && f.name !== "image.png" ? f : new File([f], `capture-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`, { type: f.type });
        void upload(named);
      });
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (!form.contains(e.relatedTarget as Node)) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      setDragging(false);
      [...e.dataTransfer.files].forEach((f) => void upload(f));
    };
    const onReset = () => setItems([]);
    form.addEventListener("paste", onPaste);
    form.addEventListener("dragover", onDragOver);
    form.addEventListener("dragleave", onDragLeave);
    form.addEventListener("drop", onDrop);
    form.addEventListener("reset", onReset);
    return () => {
      form.removeEventListener("paste", onPaste);
      form.removeEventListener("dragover", onDragOver);
      form.removeEventListener("dragleave", onDragLeave);
      form.removeEventListener("drop", onDrop);
      form.removeEventListener("reset", onReset);
    };
  }, [upload]);

  const ids = items.filter((i) => i.status === "done" && i.id).map((i) => i.id!);
  const busy = items.some((i) => i.status === "uploading");

  return (
    <div ref={root} className={`space-y-2 rounded-lg transition ${dragging ? "outline-2 outline-dashed outline-accent" : ""}`}>
      <input type="hidden" name={name} value={ids.join(",")} />
      {/* Bloque l'envoi du formulaire tant qu'un fichier part encore. */}
      {busy && <input type="text" required value="" onChange={() => {}} aria-hidden tabIndex={-1} className="sr-only" title="Envoi des fichiers en cours…" />}
      <input
        ref={input}
        type="file"
        multiple
        accept={Object.keys(ALLOWED_TYPES).join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          [...(e.target.files ?? [])].forEach((f) => void upload(f));
          e.target.value = "";
        }}
      />
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((it) => (
            <li key={it.key} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${it.status === "error" ? "border-critical/40 bg-critical/5" : "border-border bg-surface"}`}>
              {it.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:)
                <img src={it.preview} alt="" className="size-9 rounded object-cover" />
              ) : (
                <IconPaperclip className="text-muted" />
              )}
              <span className="max-w-40 truncate">{it.file.name}</span>
              <span className="text-muted">
                {it.status === "uploading" ? "envoi…" : it.status === "error" ? it.error : formatSize(it.file.size)}
              </span>
              {it.preview && it.status !== "uploading" && (
                <button type="button" className="text-accent hover:underline" onClick={() => setAnnotating(it)}>Annoter</button>
              )}
              <button type="button" aria-label={`Retirer ${it.file.name}`} className="px-1 text-muted hover:text-critical" onClick={() => remove(it)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <button type="button" className={compact ? "btn-ghost h-8 px-2 text-xs" : "btn h-8 text-xs"} onClick={() => input.current?.click()}>
          <IconImage />
          Joindre une capture ou un fichier
        </button>
        {!compact && <span>ou colle une capture (⌘V), ou glisse un fichier ici · 4 Mo max</span>}
      </div>
      {annotating && (
        <Annotator
          file={annotating.file}
          onCancel={() => setAnnotating(null)}
          onDone={(annotated) => {
            const old = annotating;
            setAnnotating(null);
            if (old.id) void fetch(`/api/fichiers?id=${old.id}`, { method: "DELETE" });
            void upload(annotated, old.key);
          }}
        />
      )}
    </div>
  );
}
