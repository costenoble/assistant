"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "rect" | "arrow" | "pen" | "text";
type Point = { x: number; y: number };
type Shape =
  | { tool: "rect" | "arrow"; color: string; from: Point; to: Point }
  | { tool: "pen"; color: string; points: Point[] }
  | { tool: "text"; color: string; at: Point; text: string };

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#111827"];
const TOOLS: { key: Tool; label: string }[] = [
  { key: "rect", label: "Cadre" },
  { key: "arrow", label: "Flèche" },
  { key: "pen", label: "Crayon" },
  { key: "text", label: "Texte" },
];

/**
 * Annoter une image avant de l'envoyer : cadre, flèche, crayon, texte.
 * Le dessin se fait à la résolution réelle de l'image ; `onDone` reçoit un PNG.
 */
export function Annotator({ file, onDone, onCancel }: { file: File; onDone: (annotated: File) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState(COLORS[0]!);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const drawing = useRef<Shape | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const width = image ? Math.max(4, Math.round(image.naturalWidth / 300)) : 4;

  const paint = useCallback(
    (extra?: Shape | null) => {
      const c = canvas.current;
      if (!c || !image) return;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(image, 0, 0);
      for (const s of extra ? [...shapes, extra] : shapes) {
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (s.tool === "rect") ctx.strokeRect(s.from.x, s.from.y, s.to.x - s.from.x, s.to.y - s.from.y);
        if (s.tool === "pen") {
          ctx.beginPath();
          s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
        }
        if (s.tool === "arrow") {
          const angle = Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x);
          const head = width * 5;
          ctx.beginPath();
          ctx.moveTo(s.from.x, s.from.y);
          ctx.lineTo(s.to.x, s.to.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.to.x, s.to.y);
          ctx.lineTo(s.to.x - head * Math.cos(angle - Math.PI / 6), s.to.y - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(s.to.x - head * Math.cos(angle + Math.PI / 6), s.to.y - head * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
        if (s.tool === "text") {
          const size = width * 6;
          ctx.font = `600 ${size}px -apple-system, "Segoe UI", sans-serif`;
          // Liseré sombre ou clair pour rester lisible sur n'importe quel fond.
          ctx.lineWidth = Math.max(2, width / 1.5);
          ctx.strokeStyle = s.color === "#ffffff" ? "#111827" : "#ffffff";
          ctx.strokeText(s.text, s.at.x, s.at.y);
          ctx.fillText(s.text, s.at.x, s.at.y);
        }
      }
    },
    [image, shapes, width],
  );

  useEffect(() => {
    const c = canvas.current;
    if (!c || !image) return;
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    paint();
  }, [image, paint]);

  /** Position dans l'image (le canvas est affiché réduit). */
  const pos = (e: React.PointerEvent): Point => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const down = (e: React.PointerEvent) => {
    const p = pos(e);
    if (tool === "text") {
      const text = window.prompt("Texte à ajouter :")?.trim();
      if (text) setShapes((s) => [...s, { tool: "text", color, at: p, text: text.slice(0, 80) }]);
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = tool === "pen" ? { tool, color, points: [p] } : { tool, color, from: p, to: p };
  };
  const move = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d) return;
    const p = pos(e);
    if (d.tool === "pen") d.points.push(p);
    else if (d.tool === "rect" || d.tool === "arrow") d.to = p;
    paint(d);
  };
  const up = () => {
    const d = drawing.current;
    drawing.current = null;
    if (d) setShapes((s) => [...s, d]);
  };

  const save = () => {
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const name = file.name.replace(/\.[^.]+$/, "") + "-annotee.png";
      onDone(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-label="Annoter l'image"
      className="m-auto h-[min(92dvh,900px)] w-[min(96vw,1200px)] rounded-xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div role="radiogroup" aria-label="Outil" className="flex gap-1">
            {TOOLS.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={tool === t.key} onClick={() => setTool(t.key)} className={`rounded-md px-3 py-1.5 text-sm ${tool === t.key ? "bg-surface-2 font-medium" : "text-muted hover:text-text"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Couleur" className="flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Couleur ${c}`} onClick={() => setColor(c)} className={`size-6 rounded-full border border-border ${color === c ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
            ))}
          </div>
          <button type="button" className="btn-ghost h-8 text-sm" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>Annuler le dernier</button>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn" onClick={onCancel}>Fermer</button>
            <button type="button" className="btn-primary" onClick={save} disabled={!image}>Utiliser cette image</button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-2/50 p-3">
          <canvas
            ref={canvas}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            className="max-h-full max-w-full cursor-crosshair touch-none rounded shadow"
            aria-label="Image à annoter"
          />
        </div>
      </div>
    </dialog>
  );
}
