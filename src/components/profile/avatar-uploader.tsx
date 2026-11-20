"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../workspace/bits";

/** Recadre au centre en carré et réduit à 320 px (WebP), dans le navigateur. */
async function squareThumb(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 320;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
  if (blob?.type === "image/webp") return blob;
  return (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9)))!;
}

/** Photo de profil : choisir, voir tout de suite, retirer. */
export function AvatarUploader({ name, current }: { name: string; current: string | null }) {
  const router = useRouter();
  const [src, setSrc] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choisissez une image.");
    setBusy(true);
    setError(null);
    try {
      const thumb = await squareThumb(file);
      setSrc(URL.createObjectURL(thumb));
      const fd = new FormData();
      fd.set("file", new File([thumb], "photo", { type: thumb.type }));
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Envoi impossible.");
        setSrc(current);
      } else router.refresh();
    } catch {
      setError("Cette image n'a pas pu être lue.");
      setSrc(current);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    await fetch("/api/avatar", { method: "DELETE" });
    setSrc(null);
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} className="group relative rounded-full" aria-label="Changer la photo">
        <Avatar name={name} src={src} size="size-20 text-xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
          {busy ? "…" : "Changer"}
        </span>
      </button>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>{src ? "Changer la photo" : "Ajouter une photo"}</button>
          {src && <button type="button" className="btn-ghost h-10 text-sm" onClick={remove} disabled={busy}>Retirer</button>}
        </div>
        <p className="text-xs text-muted">Recadrée en carré automatiquement.</p>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
